/* =============================================================================
   EMPYREAN — app-patch-v49.js
   REAL wallet-to-wallet transfers + EMPY-wallet SOS donations.

   Load order: after app-wallet.js, app-sos.js, and app-patch-v48.js (this
   file follows the exact same "capture-phase override, purely additive,
   never edit the file it's patching" approach v48 established for the
   withdrawal form — see that file's own header comment for the full
   rationale).

   ═══════════════════════════════════════════════════════════════════════
   PART 1 — WALLET-TO-WALLET TRANSFER (real, replaces fake UI)
   ═══════════════════════════════════════════════════════════════════════
   BACKGROUND: the "Internal Transfer (Wallet to Wallet)" card in index.html
   says "Send EMPY tokens to another user on the Empyrean platform" but its
   #p2p-transfer-form actually asked for a "Polygon Wallet Address" (0x...)
   — a field the submit handler (app-fixes.js, case 'p2p-transfer-form')
   never even read. That handler just deducted the sender's local
   userState.empyBalance and showed a success toast. No recipient was ever
   looked up, no Firestore write ever happened, and the balance change
   didn't survive a page refresh. Nobody ever actually received anything.

   FIX: index.html's #transfer-address field is repurposed as a plain
   username (see the matching index.html edit — label/placeholder changed,
   id kept as 'transfer-address' so this file doesn't depend on a second,
   riskier HTML edit). This file intercepts the form submit in the CAPTURE
   phase and calls stopImmediatePropagation() before app-fixes.js's
   bubble-phase switch-case ever runs, then does the real thing: look up
   the recipient by username, move the balance with a Firestore
   transaction (atomic — no double-spend if the sender fires two transfers
   back to back), and write an audit record to wallet_transfers.

   Firestore rule this depends on (already added to firebase-rules.js):
   isEmpyBalanceCreditOnlyUpdate — lets the sender's client credit the
   recipient's empyBalance (a field on a doc they don't own) without
   opening general write access, and without ever allowing a debit.

   ═══════════════════════════════════════════════════════════════════════
   PART 2 — SOS DONATIONS FROM EMPY WALLET BALANCE
   ═══════════════════════════════════════════════════════════════════════
   BACKGROUND: app-sos.js's donation modal (#sos-donation-modal) only ever
   offers card/crypto/bank — every path funnels into Flutterwave. There
   was no way to donate straight from an EMPY balance you already hold.

   FIX: a fourth "EMPY Wallet" tab is added to the existing payment-tabs
   in that modal (see index.html edit — the tab-switching JS in
   app-wallet.js §10 is already generic and needs no changes). This file
   intercepts #donation-form's submit in the capture phase ONLY when that
   tab is the active one (checked via the .payment-method-content.active
   class the existing tab-switcher already maintains); for every other
   tab it does nothing and app-sos.js's own handler runs exactly as
   before. When the EMPY tab is active: validates balance, credits the
   SOS requester's empyBalance directly via the same transaction pattern
   as Part 1 (no card/chargeback risk here — the donor's balance already
   proves the funds exist, so there's no need to hold it in a "pending
   verification" limbo the way the cash-donation escrow currently does),
   and writes an audit record to sos_donations_empy.
   ============================================================================= */

(function empyreanPatchV49() {
    'use strict';

    if (window._empPatchV49Loaded) {
        console.warn('[V49] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV49Loaded = true;

    function _us()   { return (window.EmpState && window.EmpState.userState) || window.userState || {}; }
    function _guest(){ var s = window.EmpState || {}; return s.isGuest != null ? s.isGuest : !!window.isGuest; }
    function _fbOk() { return !!(window._firebaseLoaded && window.fbDb); }
    function _fv()   { return (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue) || null; }
    function _notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type); }
    function _openAuth() {
        var m = document.getElementById('auth-modal-overlay');
        if (m) { m.style.display = 'flex'; m.classList.add('show'); document.body.classList.add('modal-open'); }
    }

    /* =========================================================================
       Shared: look up a user by username, atomically move EMPY between two
       user docs, and return the resolved names for the success toast.
       ========================================================================= */
    function _findUserByUsername(handle) {
        return window.fbDb.collection('users').where('username', '==', handle).limit(1).get()
            .then(function (snap) {
                if (snap.empty) return null;
                var doc = snap.docs[0];
                return Object.assign({ id: doc.id }, doc.data() || {});
            });
    }

    // amount moves OUT of fromUserId's empyBalance and INTO toUserId's.
    // Runs as a single Firestore transaction so two transfers fired in
    // quick succession can't both read a stale "sufficient balance" and
    // both succeed (classic double-spend race) — the transaction retries
    // automatically on a conflicting concurrent write.
    function _runEmpyTransfer(fromUserId, toUserId, amount) {
        var fromRef = window.fbDb.collection('users').doc(fromUserId);
        var toRef   = window.fbDb.collection('users').doc(toUserId);

        return window.fbDb.runTransaction(function (tx) {
            return Promise.all([tx.get(fromRef), tx.get(toRef)]).then(function (results) {
                var fromSnap = results[0], toSnap = results[1];
                if (!fromSnap.exists) throw new Error('Your account could not be loaded — please try again.');
                if (!toSnap.exists)   throw new Error('Recipient account could not be loaded.');

                var fromBal = Number((fromSnap.data() || {}).empyBalance || 0);
                var toBal   = Number((toSnap.data()   || {}).empyBalance || 0);
                if (fromBal < amount) throw new Error('INSUFFICIENT_BALANCE');

                tx.update(fromRef, { empyBalance: fromBal - amount });
                tx.update(toRef,   { empyBalance: toBal + amount });
                return true;
            });
        });
    }

    /* =========================================================================
       PART 1 — Wallet-to-wallet transfer
       ========================================================================= */
    function _submitWalletTransfer(form) {
        if (_guest()) { _openAuth(); return; }
        if (!_fbOk()) { _notify('Offline — cannot send a transfer right now.', 'error'); return; }

        var us = _us();
        var handleInput = form.querySelector('#transfer-address');
        var amountInput = form.querySelector('#transfer-amount');
        var handle = ((handleInput && handleInput.value) || '').trim().replace(/^@/, '');
        var amount = parseFloat((amountInput && amountInput.value) || 0);

        if (!handle) { _notify('Enter the recipient\u2019s username.', 'error'); return; }
        if (!amount || amount <= 0) { _notify('Enter a valid amount to send.', 'error'); return; }
        if (handle.toLowerCase() === String(us.username || '').toLowerCase()) {
            _notify('You can\u2019t send EMPY to yourself.', 'error'); return;
        }
        if (Number(us.empyBalance || 0) < amount) {
            _notify('Insufficient EMPY balance for this transfer.', 'error'); return;
        }

        var btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.dataset._origLabel = btn.innerHTML; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending…'; }

        function _restore() { if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset._origLabel || 'Send EMPY'; } }

        _findUserByUsername(handle)
            .then(function (recipient) {
                if (!recipient) { throw new Error('NOT_FOUND'); }
                if (recipient.id === us.id) { throw new Error('SELF'); }
                return _runEmpyTransfer(us.id, recipient.id, amount).then(function () {
                    return recipient;
                });
            })
            .then(function (recipient) {
                // Reflect locally right away rather than waiting on a reload.
                us.empyBalance = Number(us.empyBalance || 0) - amount;
                if (window.userState) window.userState.empyBalance = us.empyBalance;
                if (typeof window.updateWalletUI === 'function') window.updateWalletUI();

                window.fbDb.collection('wallet_transfers').add({
                    fromUserId:   us.id,
                    fromUsername: us.username || us.fullName || '',
                    toUserId:     recipient.id,
                    toUsername:   recipient.username || recipient.fullName || handle,
                    amount:       amount,
                    createdAt:    new Date().toISOString()
                }).catch(function () {}); // audit-only write; never blocks the already-completed transfer

                _notify('\u2705 ' + amount.toLocaleString() + ' EMPY sent to ' + (recipient.username || handle) + '!', 'success');
                form.reset();
                if (typeof window.updateTransferPreview === 'function') window.updateTransferPreview();
            })
            .catch(function (err) {
                var msg = err && err.message;
                if (msg === 'NOT_FOUND') _notify('No Empyrean user found with that username.', 'error');
                else if (msg === 'SELF') _notify('You can\u2019t send EMPY to yourself.', 'error');
                else if (msg === 'INSUFFICIENT_BALANCE') _notify('Insufficient EMPY balance for this transfer.', 'error');
                else {
                    console.error('[V49] Wallet transfer failed:', msg);
                    _notify('Transfer failed: ' + (msg || 'Unknown error'), 'error');
                }
            })
            .finally(_restore);
    }

    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!form || form.id !== 'p2p-transfer-form') return;
        // Capture phase, fires before app-fixes.js's bubble-phase switch-case
        // for the same form id — stop it before it can also run and produce
        // a second, fake, non-persisted "deduction".
        e.preventDefault();
        e.stopImmediatePropagation();
        _submitWalletTransfer(form);
    }, true);

    /* =========================================================================
       PART 2 — SOS donation from EMPY wallet balance
       ========================================================================= */
    function _empyDonationTabActive(form) {
        var panel = form.querySelector('#empy-payment-sos');
        return !!(panel && panel.classList.contains('active'));
    }

    function _submitEmpyDonation(form) {
        if (_guest()) { _openAuth(); return; }
        if (!_fbOk()) { _notify('Offline — cannot process a wallet donation right now.', 'error'); return; }

        var us  = _us();
        var ctx = window._sosDonationContext || {};
        if (!ctx.userId) { _notify('Could not identify who this donation is for — please reopen the request.', 'error'); return; }
        if (ctx.userId === us.id) { _notify('You can\u2019t donate to your own SOS request.', 'error'); return; }

        var amountInput = form.querySelector('#donate-amount-empy');
        var amount = parseFloat((amountInput && amountInput.value) || 0);
        if (!amount || amount < 1) { _notify('Minimum wallet donation is 1 EMPY.', 'error'); return; }
        if (Number(us.empyBalance || 0) < amount) { _notify('Insufficient EMPY balance for this donation.', 'error'); return; }

        var btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.dataset._origLabel = btn.innerHTML; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending…'; }
        function _restore() { if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset._origLabel || 'Donate Now'; } }

        _runEmpyTransfer(us.id, ctx.userId, amount)
            .then(function () {
                us.empyBalance = Number(us.empyBalance || 0) - amount;
                if (window.userState) window.userState.empyBalance = us.empyBalance;
                if (typeof window.updateWalletUI === 'function') window.updateWalletUI();

                window.fbDb.collection('sos_donations_empy').add({
                    donorUserId:     us.id,
                    donorUsername:   us.username || us.fullName || 'Anonymous',
                    recipientUserId: ctx.userId,
                    sosPostId:       ctx.postId || '',
                    amount:          amount,
                    status:          'completed',
                    createdAt:       new Date().toISOString()
                }).catch(function () {});

                _notify('\u2705 Thank you! ' + amount.toLocaleString() + ' EMPY donated to ' + (ctx.username || 'this cause') + '.', 'success');
                window._sosDonationContext = null;
                form.reset();
                var modal = form.closest('.modal-overlay-container');
                if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
            })
            .catch(function (err) {
                var msg = err && err.message;
                if (msg === 'INSUFFICIENT_BALANCE') _notify('Insufficient EMPY balance for this donation.', 'error');
                else {
                    console.error('[V49] EMPY donation failed:', msg);
                    _notify('Donation failed: ' + (msg || 'Unknown error'), 'error');
                }
            })
            .finally(_restore);
    }

    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!form || form.id !== 'donation-form') return;
        if (!_empyDonationTabActive(form)) return; // any other tab: let app-sos.js's own handler run untouched
        e.preventDefault();
        e.stopImmediatePropagation();
        _submitEmpyDonation(form);
    }, true);

    /* =========================================================================
       Correct the transfer preview text — no real fee applies to an
       internal balance move, so app-wallet.js's leftover "Network Fee
       (Polygon)" line is no longer accurate. Runs after app-wallet.js's own
       listener on the same event (registered earlier), overwriting its
       output rather than trying to intercept a same-file closure call.
       ========================================================================= */
    document.addEventListener('input', function (e) {
        if (!e.target || e.target.id !== 'transfer-amount') return;
        var previewEl = document.getElementById('transfer-preview');
        if (!previewEl) return;
        var amount = parseFloat(e.target.value) || 0;
        previewEl.innerHTML = amount > 0
            ? '<p>Amount to Send: <strong>' + amount.toLocaleString() + ' EMPY</strong></p><p>Fee: <strong>None</strong> — internal transfers are free.</p><p>Recipient Receives: <strong>' + amount.toLocaleString() + ' EMPY</strong></p>'
            : '<p>Enter an amount to see transaction details.</p>';
    });

    document.addEventListener('click', function (e) {
        var tab = e.target.closest && e.target.closest('.payment-tab');
        if (!tab) return;
        // Only react to tabs inside the SOS donation modal, not other
        // .payment-tabs groups elsewhere on the page (e.g. buy-EMPY tabs).
        if (!tab.closest('#sos-donation-modal')) return;
        var donationForm = document.getElementById('donation-form');
        if (!donationForm) return;
        var submitBtn = donationForm.querySelector('button[type="submit"]');
        if (!submitBtn) return;
        if (tab.dataset.target === 'empy-payment-sos') {
            submitBtn.innerHTML = '<i class="fas fa-coins"></i> Donate from Wallet';
        } else {
            submitBtn.innerHTML = '<i class="fas fa-hand-holding-heart"></i> Donate Now via Flutterwave';
        }
    });

    console.log('[EmpyreanPatchV49] \u2705 Real wallet-to-wallet transfers and EMPY-wallet SOS donations wired.');

})();