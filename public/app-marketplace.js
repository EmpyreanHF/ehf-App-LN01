/* =============================================================================
   EMPYREAN INTERNATIONAL — MARKETPLACE  (v2 — Full Fix)
   app-marketplace.js

   FIXES IN THIS VERSION
   ─────────────────────
   • Marketplace uploads now auto-reflect on home dashboard strip
   • Edit & Delete buttons on property cards are fully functional
   • Direct sales cards get Edit & Delete buttons
   • "Expand Contact" button correctly reveals/hides contact info
   • Action button row is horizontally scrollable (no wrapping)
   • Cart section fully re-engineered (all buttons work)
   • Flutterwave checkout connected via window._appConfig.flutterwave.publicKey
   ============================================================================= */

(function empyreanMarketplaceModule() {
    'use strict';

    if (window._empyreanMarketplaceLoaded) {
        console.warn('[EmpMarket] Already loaded — skipping duplicate.');
        return;
    }
    window._empyreanMarketplaceLoaded = true;

    /* ── State accessors ── */
    function _cart()    { return (window.EmpState && window.EmpState.cart) || window.cart || []; }
    function _S()       { return window.EmpState || {}; }
    function _us()      { return _S().userState || window.userState || {}; }
    function _isGuest() { var s = _S(); return s.isGuest != null ? s.isGuest : (window.isGuest !== undefined ? window.isGuest : true); }
    function _isAdmin() { var s = _S(); return s.isAdmin != null ? s.isAdmin : (window.isAdmin || false); }
    function _ready(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }

    function _setCart(v) {
        if (window.EmpState) window.EmpState.cart = v;
        window.cart = v;
    }

    /* ── Live comma-formatting on the Price/Amount field (request —
       "vehicle and truck field, amount column... should automatically
       insert commas") ─────────────────────────────────────────────────
       #item-price is the one shared Price/Amount field used across every
       Sell-flow category, including Vehicles & Trucks (see
       MKT_CATEGORY_FIELD_SCHEMAS.vehicles above — there is no separate
       "amount" field for that category; Price IS the amount column).
       index.html switched this field from type="number" to type="text"
       (a number input silently strips any non-digit character the moment
       it's typed, so commas could never render at all) — this listener
       does the actual formatting, delegated on `document` so it applies
       the instant the Sell form is shown, with no dependency on exactly
       when/how that section gets rendered.
       window._mktParseAmount() is exposed so the submit handler
       (app-fixes.js's 'marketplace-form' case) and anything else reading
       this field's value can strip the commas back out before parsing —
       matches this codebase's existing convention of exposing small
       cross-file helpers on window rather than duplicating logic. */
    function _mktParseAmount(raw) {
        return parseFloat(String(raw == null ? '' : raw).replace(/,/g, '')) || 0;
    }
    window._mktParseAmount = _mktParseAmount;

    function _mktFormatAmountInput(el) {
        if (!el) return;
        var digitsOnly = el.value.replace(/[^\d]/g, '');
        if (!digitsOnly) { el.value = ''; return; }
        // Cursor position is measured from the END of the string (i.e. how
        // many characters were after the caret before reformatting) so it
        // survives commas being inserted/removed ahead of the caret.
        var caretFromEnd = el.value.length - (el.selectionEnd || el.value.length);
        var digitsFromEnd = el.value.slice(el.selectionEnd || el.value.length).replace(/[^\d]/g, '').length;
        el.value = Number(digitsOnly).toLocaleString('en-US');
        try {
            var newPos = el.value.length - digitsFromEnd;
            // Re-derive from digit count on the formatted string rather than
            // reusing caretFromEnd directly, since inserted commas shift it.
            var seenDigits = 0, pos = el.value.length;
            for (var i = el.value.length - 1; i >= 0; i--) {
                if (seenDigits === digitsFromEnd) { pos = i + 1; break; }
                if (/\d/.test(el.value[i])) seenDigits++;
                pos = i;
            }
            el.setSelectionRange(pos, pos);
        } catch (e) { /* setSelectionRange unsupported on this input type/browser — formatting itself still applied */ }
    }
    document.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'item-price') _mktFormatAmountInput(e.target);
    });

    function _esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _notify(msg, type) {
        if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info');
    }

    /* Nigerian-format phone → wa.me WhatsApp link (same rule the seller
       profile page already uses in app-marketplace-sellers.js). */
    function _mktWaLink(phone) {
        var digits = String(phone || '').replace(/\D/g, '');
        if (!digits) return '';
        if (digits.charAt(0) === '0') digits = '234' + digits.slice(1);
        return 'https://wa.me/' + digits;
    }

    /* ── Phone number → WhatsApp hijack — RETIRED (2026-08-09, Marketplace
       Adjustments request) ──────────────────────────────────────────────
       This used to intercept every tel: link inside the marketplace/seller
       profile and force it open WhatsApp instead of the dialer. That is
       exactly why "Call" and "Contact Seller" were both landing on
       WhatsApp instead of their own destinations — this single global
       capture-phase handler was silently rewriting every plain phone
       link app-wide, including the new dedicated Call icon and the
       seller-profile Direct Phone Number column added this session.
       Per this session's explicit split — Contact Seller → in-app chat
       inbox, Call → device dialer, WhatsApp → wa.me (its own icon only,
       never inferred from a tel: link) — a tel: link must always behave
       like a tel: link again. Left disabled rather than deleted, per this
       codebase's no-deletion convention. Do not re-enable: it directly
       conflicts with the Call icon (patchMarketplaceContact,
       app-patch-v2.js) and the seller-profile phone columns
       (app-marketplace-sellers.js). */
    if (false) {
    document.addEventListener('click', function (e) {
        var link = e.target.closest(
            '.direct-contact-info a[href^="tel:"], ' +
            '.mkt-seller-contact-item[href^="tel:"], ' +
            '#marketplace a[href^="tel:"], #seller-profile-page a[href^="tel:"]'
        );
        if (!link) return;
        var wa = _mktWaLink(link.getAttribute('href').replace(/^tel:/, ''));
        if (!wa) return;
        e.preventDefault();
        var waWin = window.open(wa, '_blank', 'noopener');
        if (!waWin) location.href = wa; /* window.open unsupported/blocked — fall back to a direct navigation to wa.me (an external domain, safe to leave the app for) */
    }, true);
    }

    /* ── Inject action-row scroll CSS once ── */
    (function _injectActionRowCSS() {
        if (document.getElementById('_mkt_action_style')) return;
        var s = document.createElement('style');
        s.id = '_mkt_action_style';
        s.textContent = [
            '.property-actions {',
            '  display: flex !important;',
            '  flex-wrap: nowrap !important;',
            '  overflow-x: auto !important;',
            '  gap: 8px !important;',
            '  padding: 8px 12px !important;',
            '  scrollbar-width: none !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '}',
            '.property-actions::-webkit-scrollbar { display: none; }',
            '.property-actions .btn { flex-shrink: 0 !important; white-space: nowrap !important; }',
            /* Direct contact info expand panel */
            '.direct-contact-info {',
            '  padding: 0;',
            '  overflow: hidden;',
            '  max-height: 0;',
            '  transition: max-height 0.3s ease, padding 0.3s ease;',
            '  background: rgba(0,212,170,0.06);',
            '  border-top: 1px solid rgba(0,212,170,0.12);',
            '}',
            '.direct-contact-info.open {',
            '  max-height: 300px !important;',
            '  padding: 12px 16px !important;',
            '}',
            '.direct-contact-info p { margin: 4px 0; font-size: 0.88rem; }',
        ].join('\n');
        document.head.appendChild(s);
    })();

    /* ── Inject premium gallery-lightbox CSS once ──
       Scoped entirely to the existing gallery selectors that
       app-marketplace.js and app-fixes.js already read/write
       (#marketplace-gallery-modal, .gallery-main-image-container,
       #gallery-thumbnails-container, .gallery-thumbnail,
       #gallery-prev-btn/#gallery-next-btn). Does not touch or assume
       anything about the modal's outer HTML shell — only restyles
       these existing classes/ids, and adds a couple of new elements
       (slide counter, drag track) that §5 below creates itself. */
    (function _injectGalleryCSS() {
        if (document.getElementById('_mkt_gallery_style')) return;
        var s = document.createElement('style');
        s.id = '_mkt_gallery_style';
        s.textContent = [
            /* Backdrop: deep cinema-black with blur, fades in */
            '#marketplace-gallery-modal {',
            '  background: rgba(4,6,16,0.97) !important;',
            '  backdrop-filter: blur(6px);',
            '  -webkit-backdrop-filter: blur(6px);',
            '}',
            '#marketplace-gallery-modal.show {',
            '  animation: _mktGalleryFadeIn 0.22s ease both;',
            '}',
            '@keyframes _mktGalleryFadeIn { from { opacity: 0; } to { opacity: 1; } }',

            /* Main image stage: edge-to-edge, no letterboxed look */
            '.gallery-main-image-container {',
            '  position: relative !important;',
            '  width: 100% !important;',
            '  max-width: 720px !important;',
            '  margin: 0 auto !important;',
            '  overflow: hidden !important;',
            '  border-radius: 18px !important;',
            '  background: linear-gradient(160deg, rgba(255,255,255,0.02), rgba(255,255,255,0)) !important;',
            '  box-shadow: 0 24px 70px rgba(0,0,0,0.55), 0 2px 0 rgba(255,255,255,0.04) inset !important;',
            '  touch-action: pan-y !important;',
            '}',
            '.gallery-main-image-container img, .gallery-main-image-container video {',
            '  border-radius: 18px !important;',
            '  will-change: transform, opacity;',
            '  user-select: none;',
            '  -webkit-user-drag: none;',
            '}',
            /* Slide-transition state classes — toggled by renderMarketplaceGalleryView */
            '.gallery-main-image-container img.mkt-slide-enter-right, .gallery-main-image-container video.mkt-slide-enter-right {',
            '  animation: _mktSlideInRight 0.32s cubic-bezier(.22,.61,.36,1) both;',
            '}',
            '.gallery-main-image-container img.mkt-slide-enter-left, .gallery-main-image-container video.mkt-slide-enter-left {',
            '  animation: _mktSlideInLeft 0.32s cubic-bezier(.22,.61,.36,1) both;',
            '}',
            '@keyframes _mktSlideInRight { from { opacity:0; transform: translateX(28px) scale(0.985); } to { opacity:1; transform: translateX(0) scale(1); } }',
            '@keyframes _mktSlideInLeft  { from { opacity:0; transform: translateX(-28px) scale(0.985); } to { opacity:1; transform: translateX(0) scale(1); } }',

            /* Nav arrows: soft glass pills instead of bare circles */
            '#gallery-prev-btn, #gallery-next-btn {',
            '  width: 44px !important; height: 44px !important;',
            '  border-radius: 50% !important;',
            '  background: rgba(255,255,255,0.08) !important;',
            '  border: 1px solid rgba(255,255,255,0.14) !important;',
            '  backdrop-filter: blur(8px);',
            '  display: flex !important; align-items: center !important; justify-content: center !important;',
            '  color: #fff !important;',
            '  transition: background 0.18s, transform 0.18s !important;',
            '}',
            '#gallery-prev-btn:hover, #gallery-next-btn:hover {',
            '  background: rgba(255,255,255,0.16) !important;',
            '  transform: scale(1.06) !important;',
            '}',
            '#gallery-prev-btn:active, #gallery-next-btn:active { transform: scale(0.94) !important; }',

            /* Close button: consistent glass treatment */
            '#marketplace-gallery-modal .close-modal, #marketplace-gallery-modal .close-gallery-btn, #marketplace-gallery-modal #gallery-close-btn {',
            '  background: rgba(255,255,255,0.08) !important;',
            '  border: 1px solid rgba(255,255,255,0.14) !important;',
            '  backdrop-filter: blur(8px);',
            '  border-radius: 50% !important;',
            '  color: #fff !important;',
            '  transition: background 0.18s, transform 0.18s !important;',
            '}',
            '#marketplace-gallery-modal .close-modal:hover, #marketplace-gallery-modal .close-gallery-btn:hover, #marketplace-gallery-modal #gallery-close-btn:hover {',
            '  background: rgba(255,255,255,0.16) !important; transform: scale(1.06) !important;',
            '}',

            /* Thumbnail grid: replaces the old horizontally-scrolling strip
               with a grid showing every published item at once (Picture
               Expansion fix) — tapping any cell expands it into full view. */
            '#gallery-thumbnails-container {',
            '  display: grid !important;',
            '  grid-template-columns: repeat(4, 1fr) !important;',
            '  gap: 8px !important;',
            '  padding: 14px 16px calc(14px + env(safe-area-inset-bottom,0)) !important;',
            '  max-height: 240px !important;',
            '  overflow-y: auto !important;',
            '  overflow-x: hidden !important;',
            '  scrollbar-width: none !important;',
            '}',
            '#gallery-thumbnails-container::-webkit-scrollbar { display: none; }',
            '.gallery-thumbnail {',
            '  width: 100% !important;',
            '  aspect-ratio: 1 / 1 !important;',
            '  border-radius: 10px !important;',
            '  overflow: hidden !important;',
            '  cursor: pointer !important;',
            '  opacity: 0.5 !important;',
            '  border: 2px solid transparent !important;',
            '  transition: opacity 0.2s, border-color 0.2s, transform 0.2s !important;',
            '}',
            '.gallery-thumbnail:hover { opacity: 0.8 !important; transform: translateY(-2px) !important; }',
            '.gallery-thumbnail.active {',
            '  opacity: 1 !important;',
            '  border-color: #00D4AA !important;',
            '  box-shadow: 0 4px 14px rgba(0,212,170,0.35) !important;',
            '}',

            /* Slide counter badge — created by renderMarketplaceGalleryView */
            '.mkt-gallery-counter {',
            '  position: absolute; top: 14px; left: 50%; transform: translateX(-50%);',
            '  background: rgba(255,255,255,0.10); backdrop-filter: blur(8px);',
            '  color: #fff; font-size: 0.74rem; font-weight: 700; letter-spacing: 0.02em;',
            '  padding: 5px 14px; border-radius: 50px; z-index: 6; pointer-events: none;',
            '  border: 1px solid rgba(255,255,255,0.14);',
            '}',

            /* Dot pager — under the main image, Marketplace-style */
            '.mkt-gallery-dots {',
            '  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);',
            '  display: flex; align-items: center; gap: 6px; z-index: 6; pointer-events: none;',
            '}',
            '.mkt-gallery-dot {',
            '  width: 6px; height: 6px; border-radius: 50%;',
            '  background: rgba(255,255,255,0.4);',
            '  transition: background 0.18s, transform 0.18s;',
            '}',
            '.mkt-gallery-dot.active {',
            '  background: #fff;',
            '  transform: scale(1.3);',
            '}',
        ].join('\n');
        document.head.appendChild(s);
    })();



    /* =========================================================================
       §1  PRICE FORMATTER
       ========================================================================= */
    function _fmtPrice(price, currency) {
        var p = parseFloat(price) || 0;
        var cur = (currency || 'NGN').toUpperCase();
        switch (cur) {
            case 'NGN':  return '₦' + p.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            case 'EUR':  return '€' + p.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            case 'GBP':  return '£' + p.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            case 'GHS':  return '₵' + p.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            case 'EMPY': return p.toLocaleString() + ' EMPY';
            case 'USDT': return 'USDT ' + p.toLocaleString(undefined, { minimumFractionDigits: 2 });
            default:
                return typeof window.formatUsdPrice === 'function'
                    ? window.formatUsdPrice(p)
                    : '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2 });
        }
    }
    window._fmtPrice = _fmtPrice;


    /* =========================================================================
       §1a  Seller auto-reply presets
       Lets a seller pre-set a canned price/details response for a listing so
       a buyer tapping a price-related quick-reply gets an instant answer,
       even if the seller is offline. Cached locally for instant read, synced
       to the listing's own Firestore doc (marketplace_listings/{id}.autoReply)
       so it follows the listing across devices.
       ========================================================================= */
    function _autoReplyLocalStore() {
        try { return JSON.parse(localStorage.getItem('empyrean_mkt_autoreply') || '{}'); } catch (e) { return {}; }
    }
    function _getListingAutoReply(listingId) {
        if (!listingId) return null;
        var store = _autoReplyLocalStore();
        return store[listingId] || null;
    }
    function _setListingAutoReply(listingId, message) {
        if (!listingId) return;
        var store = _autoReplyLocalStore();
        if (message) store[listingId] = { enabled: true, message: message, updatedAt: new Date().toISOString() };
        else delete store[listingId];
        try { localStorage.setItem('empyrean_mkt_autoreply', JSON.stringify(store)); } catch (e) {}
        if (window.fbDb) {
            try {
                window.fbDb.collection('marketplace_listings').doc(listingId)
                    .set({ autoReply: store[listingId] || null }, { merge: true })
                    .catch(function () {});
            } catch (e) {}
        }
    }
    window._getListingAutoReply = _getListingAutoReply;
    window._setListingAutoReply = _setListingAutoReply;

    /** Does this buyer message read like a price/availability inquiry? */
    function _isPriceInquiry(text) {
        var t = (text || '').toLowerCase();
        return /how much|price|selling for|cost|available|negotiat/.test(t);
    }


    /* =========================================================================
       §1b  _openMarketChatOverlay — floating WhatsApp-style chat box
            Opens on top of the marketplace without navigating away.
            Messages are saved to Firestore 'messages' collection with
            senderId / receiverId so the seller sees them in their inbox.
       ========================================================================= */
    function _openMarketChatOverlay(sellerId, sellerName, listingMeta, prefillText) {
        var OVERLAY_ID = 'mkt-chat-overlay';
        listingMeta = listingMeta || {};
        var existing   = document.getElementById(OVERLAY_ID);
        if (existing) {
            /* If same seller AND same listing, just show it; otherwise rebuild
               so quick-replies/auto-reply reflect the listing actually tapped. */
            if (existing.dataset.sellerId === sellerId && existing.dataset.listingId === (listingMeta.id || '')) {
                existing.style.display = 'flex';
                var inp = existing.querySelector('.mkt-chat-input');
                /* Contact Seller — "retain" the auto message: fill the box
                   (never send it automatically) so the buyer can review or
                   edit it before tapping send, same as opening fresh below. */
                if (inp) {
                    if (prefillText && !inp.textContent.trim()) inp.textContent = prefillText;
                    inp.focus();
                    var sendBtn2 = existing.querySelector('.mkt-chat-send');
                    if (sendBtn2) sendBtn2.disabled = !inp.textContent.trim();
                }
                return;
            }
            if (existing._mktUnsub) { try { existing._mktUnsub(); } catch (e) {} }
            existing.remove();
        }

        var us = _us();
        if (!us.id) { if (typeof window.openAuthModal === 'function') window.openAuthModal('login'); return; }
        var db = window.fbDb;
        var isSeller = us.id === sellerId; /* seller previewing/replying from their own inbox */

        /* ── CSS (injected once) ── */
        if (!document.getElementById('_mkt_chat_css')) {
            var css = document.createElement('style');
            css.id  = '_mkt_chat_css';
            css.textContent = [
                '#mkt-chat-overlay{position:fixed;bottom:0;right:16px;width:320px;max-height:480px;display:flex;flex-direction:column;background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -4px 32px rgba(10,14,39,0.22);z-index:99999;font-family:inherit;overflow:hidden;}',
                '@media(max-width:480px){#mkt-chat-overlay{right:0;left:0;width:100%;border-radius:16px 16px 0 0;}}',
                '#mkt-chat-overlay .mkt-chat-header{display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(135deg,#1B2B8B,#0A0E27);color:#fff;cursor:default;}',
                '#mkt-chat-overlay .mkt-chat-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;background:rgba(255,255,255,0.15);flex-shrink:0;}',
                '#mkt-chat-overlay .mkt-chat-title{flex:1;font-weight:700;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
                '#mkt-chat-overlay .mkt-chat-close{background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;padding:0 4px;opacity:0.8;line-height:1;flex-shrink:0;}',
                '#mkt-chat-overlay .mkt-chat-close:hover{opacity:1;}',
                '#mkt-chat-overlay .mkt-chat-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:160px;max-height:320px;background:#f7f8fc;}',
                '#mkt-chat-overlay .mkt-msg{max-width:82%;padding:8px 12px;border-radius:14px;font-size:0.84rem;line-height:1.4;word-break:break-word;}',
                '#mkt-chat-overlay .mkt-msg.sent{align-self:flex-end;background:#1B2B8B;color:#fff;border-bottom-right-radius:4px;}',
                '#mkt-chat-overlay .mkt-msg.recv{align-self:flex-start;background:#fff;color:#0A0E27;border:1px solid rgba(10,14,39,0.10);border-bottom-left-radius:4px;}',
                '#mkt-chat-overlay .mkt-msg .mkt-msg-time{font-size:0.68rem;opacity:0.6;margin-top:3px;display:block;text-align:right;}',
                '#mkt-chat-overlay .mkt-chat-empty{color:#9CA3AF;font-size:0.82rem;text-align:center;margin:auto;padding:20px 0;}',
                '#mkt-chat-overlay .mkt-chat-composer{display:flex;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid rgba(10,14,39,0.08);background:#fff;flex-shrink:0;}',
                '#mkt-chat-overlay .mkt-chat-input{flex:1;border:1px solid rgba(10,14,39,0.14);border-radius:20px;padding:8px 14px;font-size:0.85rem;outline:none;resize:none;line-height:1.3;max-height:80px;overflow-y:auto;font-family:inherit;}',
                '#mkt-chat-overlay .mkt-chat-input:focus{border-color:#1B2B8B;}',
                '#mkt-chat-overlay .mkt-chat-send{flex-shrink:0;width:36px;height:36px;border-radius:50%;background:#1B2B8B;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.18s;}',
                '#mkt-chat-overlay .mkt-chat-send:hover{background:#2d45c8;}',
                '#mkt-chat-overlay .mkt-chat-send svg{width:16px;height:16px;fill:#fff;}',
                '#mkt-chat-overlay .mkt-chat-send:disabled{background:#9CA3AF;cursor:not-allowed;}',
                '#mkt-chat-overlay .mkt-chat-listing{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#eef0fa;border-bottom:1px solid rgba(10,14,39,0.06);flex-shrink:0;}',
                '#mkt-chat-overlay .mkt-chat-listing img{width:32px;height:32px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#fff;}',
                '#mkt-chat-overlay .mkt-chat-listing-info{flex:1;min-width:0;}',
                '#mkt-chat-overlay .mkt-chat-listing-info strong{display:block;font-size:0.76rem;color:#0A0E27;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
                '#mkt-chat-overlay .mkt-chat-listing-info span{font-size:0.72rem;color:#1B2B8B;font-weight:700;}',
                '#mkt-chat-overlay .mkt-chat-quickreplies{display:flex;gap:6px;padding:8px 12px 0;overflow-x:auto;flex-shrink:0;}',
                '#mkt-chat-overlay .mkt-chat-chip{flex-shrink:0;white-space:nowrap;padding:6px 12px;border-radius:14px;background:#fff;border:1px solid rgba(27,43,139,0.25);color:#1B2B8B;font-size:0.74rem;font-weight:600;cursor:pointer;transition:background 0.15s;}',
                '#mkt-chat-overlay .mkt-chat-chip:hover{background:rgba(27,43,139,0.08);}',
                '#mkt-chat-overlay .mkt-msg.auto{background:#eef7f2;border:1px dashed #00D4AA;color:#0A0E27;}',
                '#mkt-chat-overlay .mkt-msg .mkt-msg-auto-tag{display:block;font-size:0.65rem;color:#00A886;font-weight:700;margin-bottom:2px;}',
            ].join('');
            document.head.appendChild(css);
        }

        /* ── DOM ── */
        var overlay = document.createElement('div');
        overlay.id             = OVERLAY_ID;
        overlay.dataset.sellerId  = sellerId;
        overlay.dataset.listingId = listingMeta.id || '';
        var listingStrip = listingMeta.name
            ? [
                '<div class="mkt-chat-listing">',
                (listingMeta.image ? '<img src="'+_esc(listingMeta.image)+'" alt="">' : ''),
                '  <div class="mkt-chat-listing-info"><strong>'+_esc(listingMeta.name)+'</strong>',
                (listingMeta.price ? '<span>'+_esc(listingMeta.price)+'</span>' : ''),
                '  </div>',
                '</div>'
              ].join('')
            : '';
        /* FIX (request — "tailor this automated message response section
           to match job and services category"): Job Seeking, Professional
           Services, and Job Vacancy listings are people/roles, not
           products for sale — "How much are you selling?" and "What's the
           price of this item?" read oddly for a CV or a service offering.
           window._mktIsAvatarCategory (defined further down this file)
           flags exactly those three categories; everything else keeps the
           original product-oriented chips untouched. */
        var _mktChatIsJobSvc = (typeof window._mktIsAvatarCategory === 'function') && window._mktIsAvatarCategory(listingMeta.category);
        var quickReplies = _mktChatIsJobSvc
            ? ['Are you still available?', 'What are your qualifications?', "What's your rate?", 'Can we schedule a call?']
            : ['How much are you selling?', "What's the price of this item?", 'Is this still available?', 'Can we negotiate?'];
        var chipsHtml = (!isSeller)
            ? '<div class="mkt-chat-quickreplies">' + quickReplies.map(function (q) {
                return '<button type="button" class="mkt-chat-chip" data-quick="'+_esc(q)+'">'+_esc(q)+'</button>';
              }).join('') + '</div>'
            : '';
        overlay.innerHTML = [
            '<div class="mkt-chat-header">',
            '  <img class="mkt-chat-avatar" src="https://ui-avatars.com/api/?name='+encodeURIComponent(sellerName)+'&background=1B2B8B&color=fff&size=80" id="mkt-chat-av">',
            '  <span class="mkt-chat-title">'+_esc(sellerName)+'</span>',
            '  <button class="mkt-chat-close" title="Close">&times;</button>',
            '</div>',
            listingStrip,
            '<div class="mkt-chat-body" id="mkt-chat-body">',
            '  <span class="mkt-chat-empty">Say hello to '+_esc(sellerName)+'</span>',
            '</div>',
            chipsHtml,
            '<div class="mkt-chat-composer">',
            '  <div class="mkt-chat-input" contenteditable="true" role="textbox" placeholder="Message '+_esc(sellerName)+'…"></div>',
            '  <button class="mkt-chat-send" title="Send">',
            '    <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
            '  </button>',
            '</div>',
        ].join('');
        document.body.appendChild(overlay);

        var body    = overlay.querySelector('#mkt-chat-body');
        var inp     = overlay.querySelector('.mkt-chat-input');
        var sendBtn = overlay.querySelector('.mkt-chat-send');

        /* ── Load seller profile from Firestore (avatar only) ──
           NOTE: this deliberately does NOT cache into window.mockUsers
           anymore. Marketplace Messages is its own section now — a buyer
           messaging a seller about a listing should show up in the
           Marketplace Messages inbox only, not bleed into the general
           Chats tab (app-chat.js's renderContactList lists everyone
           present in mockUsers). Kept in a private cache instead. */
        window._mktProfileCache = window._mktProfileCache || {};
        if (db) {
            try {
                db.collection('users').doc(sellerId).get().then(function(doc) {
                    if (!doc.exists) return;
                    var d = doc.data();
                    d.id = d.id || sellerId;
                    var av = d.avatar || d.profilePicture || d.photoURL || '';
                    if (av) overlay.querySelector('#mkt-chat-av').src = av;
                    window._mktProfileCache[sellerId] = d;
                }).catch(function(){});
            } catch(e){}
        }

        /* ── Helper: add a bubble ── */
        function _bubble(text, isSent, ts, isAuto) {
            var empty = body.querySelector('.mkt-chat-empty');
            if (empty) empty.remove();
            var d = document.createElement('div');
            d.className = 'mkt-msg ' + (isSent ? 'sent' : 'recv') + (isAuto ? ' auto' : '');
            if (isAuto) {
                var tag = document.createElement('span');
                tag.className = 'mkt-msg-auto-tag';
                tag.textContent = '⚡ Auto-reply';
                d.appendChild(tag);
            }
            var t = document.createElement('span');
            t.textContent = text;
            var tm = document.createElement('span');
            tm.className = 'mkt-msg-time';
            tm.textContent = ts ? new Date(ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'now';
            d.appendChild(t);
            d.appendChild(tm);
            body.appendChild(d);
            body.scrollTop = body.scrollHeight;
            return d;
        }

        /* ── Thread id — kept in its OWN collection, deliberately separate
           from app-chat.js's general 'messages' collection, so marketplace
           inquiries route to the Marketplace Messages section only. Parent
           doc marketplace_messages/{tid} carries listing + unread metadata
           for the inbox list (see §1f renderMarketplaceInbox); the
           subcollection holds the actual message history. ── */
        var tid = [us.id, sellerId].sort().join('_') + (listingMeta.id ? ('__' + listingMeta.id) : '');
        var buyerId = isSeller ? null : us.id; /* resolved below if seller opened this from the inbox */

        function _localStore() {
            try { return JSON.parse(localStorage.getItem('empyrean_market_msgs') || '{}'); } catch (e) { return {}; }
        }
        function _saveLocal(msg, meta) {
            var store = _localStore();
            var entry = store[tid] || { meta: {}, thread: [] };
            entry.meta = Object.assign({}, entry.meta, meta || {});
            entry.thread.push(msg);
            store[tid] = entry;
            try { localStorage.setItem('empyrean_market_msgs', JSON.stringify(store)); } catch (e) {}
        }

        /* ── Register/refresh the inquiry doc so it shows up in the
           Marketplace Messages inbox for both sides. ── */
        function _registerInquiry(lastMessage, lastFrom) {
            var meta = {
                buyerId:      isSeller ? (listingMeta.buyerId || buyerId || '') : us.id,
                sellerId:     sellerId,
                listingId:    listingMeta.id    || '',
                listingName:  listingMeta.name  || '',
                listingPrice: listingMeta.price || '',
                listingImage: listingMeta.image || '',
                listingCategory: listingMeta.category || '',
                lastMessage:  lastMessage,
                lastFrom:     lastFrom,
                lastTs:       new Date().toISOString()
            };
            _saveLocal(null, meta); /* meta-only touch (no message row) is harmless — thread untouched below */
            if (db) {
                try {
                    var incField = (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue
                        && window.firebase.firestore.FieldValue.increment) || null;
                    var unreadKey = (lastFrom === sellerId) ? 'unreadBuyer' : 'unreadSeller';
                    var payload = Object.assign({}, meta);
                    payload[unreadKey] = incField ? incField(1) : 1;
                    db.collection('marketplace_messages').doc(tid).set(payload, { merge: true }).catch(function(){});
                } catch (e) {}
            }
        }

        /* ── Load history + real-time listener ── */
        var _unsub = null;
        if (db) {
            try {
                _unsub = db.collection('marketplace_messages').doc(tid).collection('msgs')
                    .orderBy('ts', 'asc')
                    .limit(100)
                    .onSnapshot(function(snap) {
                        if (!snap) return;
                        snap.docChanges().forEach(function(ch) {
                            if (ch.type !== 'added') return;
                            var msg = ch.doc.data();
                            var msgDocId = ch.doc.id;
                            if (body.querySelector('[data-msgid="'+msgDocId+'"]')) return; /* dedup */
                            var bubble = _bubble(msg.text || '', msg.from === us.id, msg.ts, !!msg.auto);
                            bubble.dataset.msgid = msgDocId;
                        });
                    }, function(err) {
                        console.warn('[MktChat] listener error:', err.message);
                    });
            } catch(e){}
        }

        /* ── Post a message (used by both the composer and quick-reply chips) ──
           FIX (duplicate bubble): the optimistic bubble rendered immediately
           on send had no data-msgid, so when the onSnapshot listener's
           'added' event echoed the same message back (now with a real doc
           ID) the dedup check in the listener never matched it and rendered
           a second, identical bubble — exactly the doubled "How much are
           you selling?" seen in testing. Fix: pre-generate the doc ID via
           .doc() (no args) *before* writing, tag the optimistic bubble with
           it immediately, then .set() to that same ID instead of .add().
           The listener's dedup check now finds the existing bubble by ID
           and skips re-rendering it. */
        function _post(text, fromId, toId, isAuto) {
            var msgObj = { from: fromId, to: toId, text: text, ts: new Date().toISOString(), auto: !!isAuto, read: false };
            var msgRef = null;
            if (db) {
                try { msgRef = db.collection('marketplace_messages').doc(tid).collection('msgs').doc(); } catch (e) { msgRef = null; }
            }
            var bubble = _bubble(text, fromId === us.id, msgObj.ts, isAuto);
            if (msgRef) bubble.dataset.msgid = msgRef.id;
            _saveLocal(msgObj, {});
            _registerInquiry(text, fromId);
            if (db) {
                try {
                    (msgRef ? msgRef.set(msgObj) : db.collection('marketplace_messages').doc(tid).collection('msgs').add(msgObj))
                        .catch(function(err) {
                            console.warn('[MktChat] send error:', err.message);
                            _notify('Message not saved — check connection.', 'warning');
                        });
                } catch(e) {}
            } else {
                _notify('You are offline — message saved on this device only.', 'warning');
            }
        }

        /* ── Send (buyer/seller composer) ── */
        function _send() {
            var text = inp.textContent.trim() || inp.innerText.trim();
            if (!text) return;
            inp.textContent = '';
            inp.innerText   = '';
            sendBtn.disabled = true;

            var fromId = us.id, toId = sellerId;
            _post(text, fromId, toId, false);
            sendBtn.disabled = false;

            /* ── Buyer auto-reply: if this reads like a price/availability
               inquiry and the seller has a preset auto-response for this
               listing, the buyer gets an instant canned reply — no need to
               wait for the seller to be online. Posted "from" the seller so
               it appears correctly on both sides of the thread. ── */
            if (!isSeller && listingMeta.id && _isPriceInquiry(text)) {
                var preset = _getListingAutoReply(listingMeta.id);
                if (preset && preset.enabled && preset.message) {
                    setTimeout(function () {
                        _post(preset.message, sellerId, us.id, true);
                    }, 650); /* small delay so it reads like a reply, not an echo */
                }
            }
        }

        /* ── Quick-reply chips (buyer only) ── */
        overlay.querySelectorAll('.mkt-chat-chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var text = chip.dataset.quick || chip.textContent;
                _post(text, us.id, sellerId, false);
                if (listingMeta.id) {
                    var preset = _getListingAutoReply(listingMeta.id);
                    if (preset && preset.enabled && preset.message) {
                        setTimeout(function () { _post(preset.message, sellerId, us.id, true); }, 650);
                    }
                }
            });
        });

        /* ── Events ── */
        sendBtn.addEventListener('click', _send);
        inp.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); _send(); }
        });
        inp.addEventListener('input', function() {
            sendBtn.disabled = !(inp.textContent.trim() || inp.innerText.trim());
        });
        sendBtn.disabled = true;

        /* Contact Seller — "retain" the auto-generated inquiry in the
           composer instead of sending it immediately, so the buyer sees
           it, can edit it, and sends it themselves (distinct from a
           quick-reply chip, which posts right away). */
        if (prefillText) {
            inp.textContent = prefillText;
            sendBtn.disabled = false;
        }

        overlay._mktUnsub = _unsub;
        overlay.querySelector('.mkt-chat-close').addEventListener('click', function() {
            overlay.style.display = 'none';
            if (_unsub) { try { _unsub(); } catch(e){} }
        });

        inp.focus();
        console.log('[MktChat] Overlay opened for seller:', sellerId, 'listing:', listingMeta.id || '(none)');
    }
    window._openMarketChatOverlay = _openMarketChatOverlay;


    /* =========================================================================
       §2  renderMarketplaceCards
       ========================================================================= */
    function renderMarketplaceCards() {
        document.querySelectorAll('#marketplace .property-card, #property-grid-container .property-card')
            .forEach(function (card) {
                var priceEl = card.querySelector('.property-info div:last-child');
                if (priceEl && card.dataset.price) {
                    var cur = (card.dataset.displayCurrency || card.dataset.currency || 'NGN').toUpperCase();
                    var existing = priceEl.querySelector('.currency-badge');
                    if (existing) existing.remove();
                    priceEl.textContent = _fmtPrice(card.dataset.price, cur);
                    var badge = document.createElement('span');
                    badge.className = 'currency-badge';
                    badge.textContent = cur;
                    badge.style.cssText = 'display:inline-block;margin-left:6px;font-size:0.65rem;font-weight:700;background:rgba(0,212,170,0.12);padding:2px 7px;border-radius:20px;color:#00D4AA;vertical-align:middle;';
                    priceEl.appendChild(badge);
                }

                var salesType   = card.dataset.salesType;
                var addToCartBtn = card.querySelector('.add-to-cart-btn');
                var contactBtn   = card.querySelector('.contact-seller-btn');
                var warningEl    = card.querySelector('.direct-trade-warning');

                if (addToCartBtn) addToCartBtn.style.display = 'none';
                if (contactBtn)   contactBtn.style.display   = 'none';
                if (warningEl)    warningEl.style.display    = 'none';

                if (salesType === 'escrow') {
                    if (addToCartBtn) {
                        var _cSellerId = card.dataset.sellerId || card.dataset.userId || '';
                        var _cUs       = _us();
                        var _cIsOwner  = _isAdmin() || (_cUs.id && _cSellerId && _cSellerId === _cUs.id);
                        /* Owners/admins manage their escrow listing via
                           Promote/Edit/Delete, not by adding it to their own
                           cart — Cart stays a buyer-only action. */
                        addToCartBtn.style.display = _cIsOwner ? 'none' : '';
                    }
                } else {
                    if (contactBtn) {
                        /* Contact Seller is a buyer-only action — owners/admins
                           manage their own direct-sale listing via
                           Promote/Edit/Delete instead. Gated the same way
                           addToCartBtn is gated for escrow, above. Previously
                           this showed unconditionally for every user
                           (including the owner) and also permanently
                           relabelled the button's own text to "Message
                           Seller", which collided with the separate, real
                           Message Seller button inserted by
                           _ensureMessageSellerButton() right after it — the
                           net effect was two buttons that both said
                           "Message Seller" and none that said "Contact
                           Seller". Label left untouched here so
                           app-patch-v2.js's patchMarketplaceContact keeps
                           full control of this button's text/behavior. */
                        var _dSellerId = card.dataset.sellerId || card.dataset.userId || '';
                        var _dUs       = _us();
                        var _dIsOwner  = _isAdmin() || (_dUs.id && _dSellerId && _dSellerId === _dUs.id);
                        contactBtn.style.display = _dIsOwner ? 'none' : '';
                    }
                    if (warningEl)  warningEl.style.display  = '';
                }

                /* Promote is an owner/admin-only action for both escrow and
                   direct-sale listings — buyers browsing someone else's
                   listing have no reason to see it. This toggles visibility
                   on every sweep so it also self-heals older cards that
                   were rendered before this button was owner-gated. */
                var promoteBtn = card.querySelector('.promote-post-btn, .promote-item-btn');
                if (promoteBtn) {
                    var _pSellerId = card.dataset.sellerId || card.dataset.userId || '';
                    var _pUs       = _us();
                    var _pIsOwner  = _isAdmin() || (_pUs.id && _pSellerId && _pSellerId === _pUs.id);
                    promoteBtn.style.display = _pIsOwner ? '' : 'none';
                }

                /* Ensure Edit/Delete are shown for owner/admin */
                _ensureOwnerActions(card);
                /* Ensure Message Seller is shown for buyers */
                _ensureMessageSellerButton(card);
            });
    }
    window.renderMarketplaceCards = renderMarketplaceCards;

    /**
     * Add Edit, Delete (and Promote) buttons to a card if the current user
     * is the seller or admin, and those buttons aren't already present.
     */
    function _ensureOwnerActions(card) {
        if (!card) return;
        var us = _us();
        var sellerId = card.dataset.sellerId || card.dataset.userId || '';
        var isOwner  = (us.id && sellerId && sellerId === us.id) || _isAdmin();
        if (!isOwner) return;

        var actions = card.querySelector('.property-actions');
        if (!actions) {
            /* Create an actions row for cards that don't have one (e.g. escrow cards) */
            actions = document.createElement('div');
            actions.className = 'property-actions';
            /* Insert before the first .direct-contact-info or at end of card */
            var contactInfo = card.querySelector('.direct-contact-info');
            if (contactInfo) {
                card.insertBefore(actions, contactInfo);
            } else {
                card.appendChild(actions);
            }
        }

        if (!actions.querySelector('.promote-post-btn, .promote-item-btn')) {
            var proBtn = document.createElement('button');
            proBtn.className = 'btn promote-post-btn';
            proBtn.style.cssText = 'background:linear-gradient(135deg,#1B2B8B,#0A0E27);color:#fff;border:none;flex-shrink:0;';
            proBtn.innerHTML = '<i class="fas fa-rocket"></i> Promote';
            actions.appendChild(proBtn);
        }

        if (!actions.querySelector('.edit-post-btn')) {
            var editBtn = document.createElement('button');
            editBtn.className = 'btn edit-post-btn';
            editBtn.style.cssText = 'background:rgba(0,212,170,0.10);color:#00D4AA;border:1px solid rgba(0,212,170,0.25);flex-shrink:0;';
            editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
            actions.appendChild(editBtn);
        }
        if (!actions.querySelector('.delete-post-btn')) {
            var delBtn = document.createElement('button');
            delBtn.className = 'btn delete-post-btn';
            delBtn.style.cssText = 'background:rgba(229,57,53,0.08);color:#e53935;border:1px solid rgba(229,57,53,0.2);flex-shrink:0;';
            delBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
            actions.appendChild(delBtn);
        }

        /* Auto-Reply preset — direct-sale listings only (escrow buyers don't
           message the seller, they checkout through the cart instead). Lets
           the seller set the canned response a buyer's price/availability
           quick-reply triggers instantly. */
        var salesTypeOA = (card.dataset.salesType || card.dataset.salestype || '').toLowerCase();
        if (salesTypeOA !== 'escrow' && !actions.querySelector('.mkt-autoreply-btn')) {
            var listingId = card.dataset.id || card.dataset.postId || '';
            if (listingId) {
                var arBtn = document.createElement('button');
                arBtn.className = 'btn mkt-autoreply-btn';
                arBtn.dataset.listingId = listingId;
                var hasPreset = !!_getListingAutoReply(listingId);
                arBtn.style.cssText = 'background:rgba(0,212,170,0.10);color:#00A886;border:1px solid rgba(0,212,170,0.25);flex-shrink:0;';
                arBtn.innerHTML = '<i class="fas fa-bolt"></i> ' + (hasPreset ? 'Auto-Reply ✓' : 'Auto-Reply');
                actions.appendChild(arBtn);
            }
        }
    }

    /**
     * Some older listings never had sellerId saved onto the card dataset
     * (the listing document itself is missing the field), even though the
     * card still displays a "@username" seller handle. Since the handle IS
     * available, resolve the seller's UID once via Firestore — the same
     * users.where('username','==',...) lookup app-fixes.js already uses
     * for @mention resolution — and cache it onto card.dataset.sellerId so
     * every other consumer (ownership checks, the contact panel, this
     * button) benefits from it too, not just this one call site.
     * cb(resolvedId) fires with '' if nothing could be resolved.
     */
    function _resolveMissingSellerId(card, cb) {
        if (card.dataset.sellerId) { cb(card.dataset.sellerId); return; }
        if (card._vfSellerLookupDone) { cb(''); return; } /* already tried, don't hammer Firestore */

        var handleEl = card.querySelector('.property-seller-info strong');
        var handle   = handleEl ? handleEl.textContent.replace(/^@/, '').trim() : '';
        if (!handle || handle.toLowerCase() === 'seller' || !window.fbDb) { cb(''); return; }

        card._vfSellerLookupDone = true;
        window.fbDb.collection('users').where('username', '==', handle).limit(1).get()
            .then(function (snap) {
                if (snap.empty) { cb(''); return; }
                var uid = snap.docs[0].id;
                card.dataset.sellerId = uid;
                cb(uid);
            })
            .catch(function () { cb(''); });
    }

    /**
     * Insert a persistent "Message Seller" button into the .property-actions
     * scroll row, right after the Contact Seller / Hide Contact toggle.
     *
     * Restores the send-message affordance for buyers. It used to only
     * appear buried inside the expanded contact panel (built by
     * app-patch-v2.js's patchMarketplaceContact) — easy to miss, and it
     * only shows up after tapping "Contact Seller" first. This one lives
     * in the always-visible action row instead, right where "Hide Contact"
     * sits, so it's visible whether or not the contact panel is open.
     *
     * Deliberately reuses the existing ".mkt-msg-seller-btn" class — the
     * delegated click handler for that class already exists further down
     * in this file (§ "In-panel Message Seller button") and already calls
     * _openMarketChatOverlay(sellerId, sellerName). No new click wiring
     * needed; this function only needs to place the button.
     */
    /*
     * FIX (request — Marketplace Communication Adjustments, 2026-08-09):
     * "Remove direct message inbox" / "Add direct phone call icon" — this
     * function used to insert a persistent "Message Seller" button that
     * opened the in-app marketplace chat overlay (_openMarketChatOverlay).
     * It now inserts a "Call Seller" button instead, a plain tel: link
     * built from the card's own contactPhone — no in-app chat, no inbox,
     * just the device's native phone dialer. Function name/call sites are
     * left as-is (still called _ensureMessageSellerButton from several
     * places in this file) to avoid a much larger, riskier rename sweep;
     * only what it BUILDS has changed. Falls back to a Firestore lookup
     * (mirroring the existing WhatsApp-reveal pattern elsewhere in this
     * file) for older listings/cards that don't have contactPhone in their
     * dataset yet. If no phone number can be found at all (e.g. a Vehicle
     * listing, which no longer collects one — see the Vehicle & Truck
     * section fix above), no button is inserted, same as the old "no
     * seller id" bail-out.
     */
    function _mktTelLink(phone) {
        var digits = String(phone || '').replace(/[^\d+]/g, '');
        return digits ? 'tel:' + digits : '';
    }
    function _mktInsertCallBtn(actions, contactBtn, phone, roleLabel) {
        if (actions.querySelector('.mkt-call-seller-btn')) return; /* already inserted */
        var link = _mktTelLink(phone);
        if (!link) return; /* no phone on this listing — nothing to call */
        var callBtn = document.createElement('a');
        callBtn.className = 'btn mkt-call-seller-btn';
        callBtn.href = link;
        callBtn.style.cssText = 'background:#1B2B8B;color:#fff;border:none;flex-shrink:0;text-decoration:none;display:inline-flex;align-items:center;gap:6px;';
        callBtn.innerHTML = '<i class="fas fa-phone"></i> Call ' + (roleLabel || 'Seller');
        if (contactBtn) actions.insertBefore(callBtn, contactBtn.nextSibling);
        else actions.insertBefore(callBtn, actions.firstChild);
    }
    function _ensureMessageSellerButton(card) {
        if (!card) return;
        var us        = _us();
        var salesType = (card.dataset.salesType || card.dataset.salestype || '').toLowerCase();

        /* Escrow listings route buyers through Add to Cart / checkout
           instead — Contact Seller itself is hidden for escrow, so the
           call button stays scoped to direct-sale listings only. */
        if (salesType === 'escrow') return;

        var sellerId = card.dataset.sellerId || card.dataset.userId || '';
        if (!sellerId) {
            /* Try to recover it from the visible @handle before giving up */
            _resolveMissingSellerId(card, function (resolvedId) {
                if (resolvedId) _ensureMessageSellerButton(card);
            });
            return;
        }

        var isOwner = _isAdmin() || (us.id && sellerId === us.id);
        if (isOwner) return; /* owners/admins don't need to call themselves */

        var actions = card.querySelector('.property-actions');
        if (!actions) return; /* not rendered yet — MutationObserver will retry */
        if (actions.querySelector('.mkt-call-seller-btn')) return; /* already inserted */

        var _mmRoleLabel = _mktAvatarRoleLabel(card.dataset.category || '');
        var contactBtn = actions.querySelector('.contact-seller-btn,.expand-contact-btn,.vf-contact-btn');
        var cPhone = card.dataset.contactPhone || card.dataset.phone || '';
        if (cPhone) {
            _mktInsertCallBtn(actions, contactBtn, cPhone, _mmRoleLabel);
        } else if (window._firebaseLoaded && window.fbDb) {
            var itemId = card.dataset.id || '';
            (itemId ? window.fbDb.collection('marketplace_listings').doc(itemId).get().catch(function () { return null; }) : Promise.resolve(null))
                .then(function (doc) {
                    var d = (doc && doc.exists) ? doc.data() : {};
                    var foundPhone = d.contactPhone || d.phone || '';
                    if (foundPhone) _mktInsertCallBtn(actions, contactBtn, foundPhone, _mmRoleLabel);
                });
        }
    }



    /* =========================================================================
       §3  Dashboard strip sync — addMarketItemToDashboardStrip
       Called after every successful marketplace upload.
       ========================================================================= */
    function addMarketItemToDashboardStrip(data) {
        var cont   = document.getElementById('dashboard-market-container');
        var slider = document.getElementById('dashboard-market-slider');
        if (!cont || !slider) return;
        cont.style.display = 'block';

        /* Don't duplicate */
        if (data.id && slider.querySelector('[data-id="' + data.id + '"]')) return;

        var card = document.createElement('div');
        card.dataset.id        = data.id || '';
        card.dataset.navTarget = 'marketplace';
        /* FIX (request — dashboard-strip WhatsApp/Message quick-contact
           icons): these dataset attributes weren't previously needed by
           this compact card, but _mktDecorateDashboardCard (below) reads
           them to build the WhatsApp link and open the chat overlay
           without an extra Firestore round-trip when the data's already
           on hand right after a successful upload. */
        card.dataset.sellerId     = data.sellerId || '';
        card.dataset.sellerName   = data.sellerName || '';
        card.dataset.contactPhone = data.contactPhone || '';
        card.dataset.price        = data.price || '';
        card.dataset.category     = data.category || '';

        var firstUrl = (data.media && data.media[0]) || data.img || data.videoSrc || '';
        var isVid = /\.(mp4|webm|mov)(\?|$)/i.test(firstUrl) || /\/video\/upload\//i.test(firstUrl);
        var priceStr = _fmtPrice(data.price || 0, data.currency || 'NGN');

        /* FIX (2026-08-06 — "large green Job Seeking card keeps
           reappearing on the homepage dashboard strip instead of the
           smaller premium card"): this used to branch into the full-size
           .mkt-avatar-card treatment (the same big card used on the main
           marketplace grid page) for Job Seeking / Professional Services /
           Job Vacancy listings -- that branch is what actually produced
           the large green card on the homepage dashboard strip. The main
           grid keeps its own richer avatar-card rendering elsewhere and is
           untouched by this change; this dashboard-strip card is now
           always the compact, premium .dashboard-market-card style, for
           every category. Falls back to the seller's own avatar photo
           when a Job Seeking/Services listing has no product media of its
           own, so the thumbnail is never blank. */
        var _dashThumbUrl = firstUrl || data.sellerAvatar || '';
        if (_dashThumbUrl) {
            card.className = 'dashboard-market-card';
            card.innerHTML = (isVid
                ? '<video src="' + _esc(_dashThumbUrl) + '" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;display:block;"></video>'
                : '<img src="' + _esc(_dashThumbUrl) + '" alt="' + _esc(data.name || '') + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;">')
                + '<div class="dashboard-market-card-info"><h5>' + _esc(data.name || '') + '</h5><p>' + priceStr + '</p></div>';
        } else {
            card.className = 'dashboard-market-card';
            card.innerHTML = '<div style="width:100%;height:80px;background:rgba(0,212,170,0.08);display:flex;align-items:center;justify-content:center;"><i class="fas fa-store" style="font-size:2rem;color:rgba(0,212,170,0.5);"></i></div>'
                + '<div class="dashboard-market-card-info"><h5>' + _esc(data.name || '') + '</h5><p>' + priceStr + '</p></div>';
        }

        slider.prepend(card);
    }
    window.addMarketItemToDashboardSlider = addMarketItemToDashboardStrip; /* alias for app-fixes.js */
    window.addMarketItemToDashboardStrip  = addMarketItemToDashboardStrip;


    /* =========================================================================
       §4  updateCartUI
       ========================================================================= */
    function updateCartUI() {
        var cart = _cart();

        /* Badge */
        document.querySelectorAll('.cart-item-count').forEach(function (el) {
            el.textContent = cart.length;
        });

        var itemsCont   = document.getElementById('cart-items-container');
        var cartTotalEl = document.getElementById('cart-total');
        var checkoutBtn = document.querySelector('.checkout-btn');

        if (!itemsCont || !cartTotalEl) return;

        /* Show cart view, hide checkout view */
        var cartView     = document.getElementById('cart-view');
        var checkoutView = document.getElementById('checkout-view');
        if (cartView)     cartView.style.display     = 'block';
        if (checkoutView) checkoutView.style.display = 'none';

        if (cart.length === 0) {
            itemsCont.innerHTML = '<p style="text-align:center;padding:30px 20px;color:var(--text-muted);">'
                + '<i class="fas fa-shopping-cart" style="font-size:2.5rem;display:block;margin-bottom:12px;opacity:0.35;"></i>'
                + 'Your cart is empty</p>';
            cartTotalEl.textContent = 'Total: $0.00';
            if (checkoutBtn) checkoutBtn.disabled = true;
            return;
        }

        if (checkoutBtn) checkoutBtn.disabled = false;

        var html = '';
        cart.forEach(function (item) {
            var priceStr = _fmtPrice(item.price, item.currency || 'NGN');
            html += '<div class="cart-item" data-id="' + _esc(item.id) + '" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06);">'
                + '<img src="' + _esc(item.img || '') + '" alt="' + _esc(item.name) + '" '
                + 'onerror="this.style.display=\'none\'" style="width:70px;height:70px;object-fit:cover;border-radius:10px;flex-shrink:0;">'
                + '<div style="flex:1;min-width:0;">'
                + '<div style="font-weight:700;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _esc(item.name) + '</div>'
                + '<div style="color:var(--accent-color,#00D4AA);font-weight:700;font-size:0.95rem;margin-top:4px;">' + priceStr + '</div>'
                + '</div>'
                + '<button class="remove-cart-item-btn" data-id="' + _esc(item.id) + '" '
                + 'style="background:none;border:none;color:#e53935;cursor:pointer;font-size:1.1rem;padding:4px 8px;border-radius:6px;flex-shrink:0;" '
                + 'title="Remove"><i class="fas fa-times"></i></button>'
                + '</div>';
        });
        itemsCont.innerHTML = html;

        /* Group totals by currency */
        var totals = {};
        cart.forEach(function (item) {
            var cur = (item.currency || 'NGN').toUpperCase();
            totals[cur] = (totals[cur] || 0) + parseFloat(item.price || 0);
        });
        var totalStr = Object.keys(totals).map(function (cur) {
            return _fmtPrice(totals[cur], cur);
        }).join(' + ');
        cartTotalEl.textContent = 'Total: ' + totalStr;
    }
    window.updateCartUI = updateCartUI;


    /* =========================================================================
       §5  GALLERY LIGHTBOX
       ========================================================================= */
    function _mgs() {
        return (window.EmpState && window.EmpState.marketplaceGalleryState)
            || window.marketplaceGalleryState
            || { media: [], currentIndex: 0 };
    }
    function _setMgs(patch) {
        var s = _mgs();
        Object.assign(s, patch);
        if (window.EmpState) window.EmpState.marketplaceGalleryState = s;
        else window.marketplaceGalleryState = s;
    }

    function showMarketplaceGallery(media, startIndex) {
        startIndex = startIndex || 0;
        _setMgs({ media: media, currentIndex: startIndex });
        var modal = document.getElementById('marketplace-gallery-modal');
        if (!modal) return;
        modal.style.display = '';
        modal.style.visibility = '';
        modal.classList.add('show');
        document.body.classList.add('modal-open');
        renderMarketplaceGalleryView();
    }
    window.showMarketplaceGallery = showMarketplaceGallery;

    function _stopGalleryVideo() {
        var v = document.querySelector('.gallery-main-image-container video');
        if (v) { try { v.pause(); v.src = ''; } catch (e) {} }
    }

    function renderMarketplaceGalleryView(direction) {
        var mainCont   = document.querySelector('.gallery-main-image-container');
        var thumbsCont = document.getElementById('gallery-thumbnails-container');
        if (!mainCont || !thumbsCont) return;

        var state = _mgs();
        Array.from(mainCont.childNodes).forEach(function (node) {
            if (node.nodeType === 1 && node.tagName !== 'BUTTON') node.remove();
        });

        var rawMedia = state.media[state.currentIndex];
        if (!rawMedia) return;

        var currentUrl  = typeof rawMedia === 'string' ? rawMedia : (rawMedia.url || rawMedia);
        var currentType = typeof rawMedia === 'object' ? (rawMedia.type || '') : '';
        var isVideo     = currentType.startsWith('video/')
            || /\.(mp4|webm|mov)(\?|$)/i.test(currentUrl)
            || /\/video\/upload\//i.test(currentUrl);

        var mainEl;
        if (isVideo) {
            mainEl = document.createElement('video');
            mainEl.src = currentUrl; mainEl.controls = true; mainEl.autoplay = true; mainEl.loop = true;
            /* FIX (over-magnified media): this inline style used to force
               width:100%, which stretched every image/video up to fill the
               full width of .gallery-main-image-container regardless of its
               real resolution -- a small photo ended up blown up and
               pixelated ("overly magnified") instead of shown at its
               natural size. max-width/max-height with object-fit:contain
               lets the browser size the media at its intrinsic dimensions,
               scaling down only when it doesn't fit -- never up beyond it. */
            mainEl.style.cssText = 'max-width:100%;max-height:80vh;object-fit:contain;';
        } else {
            mainEl = document.createElement('img');
            mainEl.src = currentUrl; mainEl.alt = 'Marketplace item'; mainEl.loading = 'lazy';
            mainEl.style.cssText = 'max-width:100%;max-height:80vh;object-fit:contain;';
        }
        mainEl.onerror = function () { this.style.opacity = '0.3'; };
        /* FIX (premium redesign): apply a slide-in transition class that
           matches the navigation direction — +1 (next) enters from the
           right, -1 (prev) enters from the left, matching the physical
           direction of a swipe/arrow tap. No direction passed (first open,
           thumbnail jump) → no animation class, so those stay an instant
           cut as before. Purely a CSS class; the underlying element swap
           logic is unchanged. */
        if (direction === 1)      mainEl.classList.add('mkt-slide-enter-right');
        else if (direction === -1) mainEl.classList.add('mkt-slide-enter-left');
        mainCont.appendChild(mainEl);

        /* Slide counter badge ("2 / 5") — created once, reused on every
           render. Skipped entirely for single-image listings since a
           counter showing "1 / 1" adds nothing. */
        var counter = mainCont.querySelector('.mkt-gallery-counter');
        if (state.media.length > 1) {
            if (!counter) {
                counter = document.createElement('div');
                counter.className = 'mkt-gallery-counter';
                mainCont.appendChild(counter);
            } else {
                mainCont.appendChild(counter); /* keep on top of freshly-appended media */
            }
            counter.textContent = (state.currentIndex + 1) + ' / ' + state.media.length;
        } else if (counter) {
            counter.remove();
        }

        /* Dot pager — DISABLED (Picture Expansion fix): the round dot
           indicators are replaced by the full media grid rendered into
           #gallery-thumbnails-container below, which already shows every
           item and the current selection without needing a separate pager.
           Guarded rather than removed in case it's wanted again later. */
        var dots = mainCont.querySelector('.mkt-gallery-dots');
        if (dots) dots.remove();
        if (false) {
        if (state.media.length > 1) {
            if (!dots) {
                dots = document.createElement('div');
                dots.className = 'mkt-gallery-dots';
                mainCont.appendChild(dots);
            } else {
                mainCont.appendChild(dots); /* keep on top of freshly-appended media */
            }
            dots.innerHTML = state.media.map(function (_, idx) {
                return '<span class="mkt-gallery-dot' + (idx === state.currentIndex ? ' active' : '') + '"></span>';
            }).join('');
        } else if (dots) {
            dots.remove();
        }
        }

        thumbsCont.innerHTML = state.media.map(function (item, idx) {
            var thumbUrl  = typeof item === 'string' ? item : (item.url || item);
            var thumbType = typeof item === 'object' ? (item.type || '') : '';
            var isThumbVid = thumbType.startsWith('video/') || /\.(mp4|webm|mov)(\?|$)/i.test(thumbUrl);
            var active = idx === state.currentIndex ? 'active' : '';
            return '<div class="gallery-thumbnail ' + active + '" data-index="' + idx + '">'
                + (isThumbVid
                    ? '<video src="' + thumbUrl + '#t=0.5" preload="metadata" muted style="width:100%;height:100%;object-fit:cover;"></video>'
                    : '<img src="' + thumbUrl + '" alt="Thumb" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.opacity=0.3">')
                + '</div>';
        }).join('');

        /* Keep the active thumbnail scrolled into view as the user
           navigates, so the strip tracks the current slide automatically
           instead of requiring a manual scroll to find it. */
        var activeThumb = thumbsCont.querySelector('.gallery-thumbnail.active');
        if (activeThumb && typeof activeThumb.scrollIntoView === 'function') {
            activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }
    window.renderMarketplaceGalleryView = renderMarketplaceGalleryView;

    function navigateMarketplaceGallery(direction) {
        _stopGalleryVideo();
        var state = _mgs(), len = state.media.length;
        if (!len) return;
        _setMgs({ currentIndex: (((state.currentIndex + direction) % len) + len) % len });
        renderMarketplaceGalleryView();
    }
    window.navigateMarketplaceGallery = navigateMarketplaceGallery;

    function _closeGallery() {
        _stopGalleryVideo();
        var modal = document.getElementById('marketplace-gallery-modal');
        if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
        document.body.classList.remove('modal-open');
        _setMgs({ media: [], currentIndex: 0 });
    }
    /* NOTE: horizontal swipe-to-navigate for this modal is already
       implemented in app-fixes.js ("FIX 9b: Swipe navigation inside
       marketplace gallery modal"). Do not add a second touch handler
       here — two handlers firing on the same swipe causes the gallery
       to skip two slides per swipe instead of one. */


    /* =========================================================================
       §6  PROMOTION MODAL
       ========================================================================= */
    function updatePromoReachPreview() {
        var budgetInput = document.getElementById('promo-budget');
        var previewEl   = document.getElementById('promo-reach-preview');
        if (!budgetInput || !previewEl) return;
        var budget = parseFloat(budgetInput.value) || 0;
        if (budget < 1000) { previewEl.textContent = 'Minimum budget is ₦1,000'; return; }
        var reach;
        if      (budget <= 10000)  reach = budget * 2;
        else if (budget <= 50000)  reach = 20000 + (budget - 10000) * 2.5;
        else if (budget <= 200000) reach = 120000 + (budget - 50000) * 3;
        else if (budget <= 500000) reach = 570000 + (budget - 200000) * 4;
        else                       reach = 1770000 + (budget - 500000) * 5;
        previewEl.textContent = 'Estimated Reach: ~' + Math.floor(reach).toLocaleString() + ' people';
    }
    window.updatePromoReachPreview = updatePromoReachPreview;

    function promptForPromotion(postId) {
        if (_isGuest()) { if (typeof window.openAuthModal === 'function') window.openAuthModal('login'); return; }
        if (!postId) { _notify('Cannot promote: item has no ID.', 'warning'); return; }
        setTimeout(function () {
            var promoModal = document.getElementById('promotion-modal-overlay');
            if (!promoModal) return;
            var setupView = document.getElementById('promotion-setup-view');
            var payEl     = document.getElementById('promotion-payment-details');
            var postIdIn  = promoModal.querySelector('#promote-post-id');
            if (setupView) setupView.style.display = 'block';
            if (payEl)     payEl.style.display     = 'none';
            if (postIdIn)  postIdIn.value           = postId;
            updatePromoReachPreview();
            promoModal.classList.add('show');
            document.body.classList.add('modal-open');
        }, 100);
    }
    window.promptForPromotion = promptForPromotion;


    /* =========================================================================
       §7  CART CHECKOUT with Flutterwave
       ========================================================================= */
    function _doFlutterwaveCheckout() {
        var cart = _cart();
        if (!cart.length) { _notify('Your cart is empty.', 'warning'); return; }

        var nameEl  = document.getElementById('checkout-name');
        var addrEl  = document.getElementById('checkout-address');
        var emailEl = document.getElementById('checkout-buyer-email');
        var phoneEl = document.getElementById('checkout-buyer-phone');

        var buyerName  = nameEl  ? nameEl.value.trim()  : '';
        var buyerAddr  = addrEl  ? addrEl.value.trim()  : '';
        var buyerEmail = emailEl ? emailEl.value.trim() : (_us().email || 'buyer@empyrean.com');
        var buyerPhone = phoneEl ? phoneEl.value.trim() : '';

        if (!buyerName || !buyerAddr) {
            _notify('Please fill in your name and shipping address.', 'error');
            if (nameEl && !nameEl.value.trim()) nameEl.style.borderColor = 'var(--danger-color,#e53935)';
            if (addrEl && !addrEl.value.trim()) addrEl.style.borderColor = 'var(--danger-color,#e53935)';
            return;
        }

        var totalsObj = {};
        cart.forEach(function (item) {
            var cur = (item.currency || 'NGN').toUpperCase();
            totalsObj[cur] = (totalsObj[cur] || 0) + parseFloat(item.price || 0);
        });

        /* Convert to NGN for Flutterwave (use first currency total) */
        var totalNGN = 0;
        var USD_TO_NGN = (window.EmpState && window.EmpState.USD_TO_NGN_RATE) || window.USD_TO_NGN_RATE || 1600;
        Object.keys(totalsObj).forEach(function (cur) {
            var amt = totalsObj[cur];
            if (cur === 'NGN')  totalNGN += amt;
            else if (cur === 'USD') totalNGN += amt * USD_TO_NGN;
            else if (cur === 'GBP') totalNGN += amt * USD_TO_NGN * 1.27;
            else totalNGN += amt;
        });
        totalNGN = Math.round(totalNGN);

        var fwKey = (window._appConfig && window._appConfig.flutterwave && window._appConfig.flutterwave.publicKey) || '';

        if (typeof FlutterwaveCheckout !== 'function') {
            _notify('Payment gateway not loaded. Please refresh and try again.', 'error');
            return;
        }

        FlutterwaveCheckout({
            public_key:      fwKey,
            tx_ref:          'EMPY-MKT-' + Date.now(),
            amount:          totalNGN,
            currency:        'NGN',
            payment_options: 'card,banktransfer,ussd,mobilemoney',
            customer: {
                email:        buyerEmail,
                phone_number: buyerPhone,
                name:         buyerName
            },
            customizations: {
                title:       'Empyrean Marketplace',
                description: 'Secure escrow for ' + cart.length + ' item(s). Funds held until delivery confirmed.',
                logo:        'https://cdn-icons-png.flaticon.com/512/6001/6001527.png'
            },
            callback: function (data) {
                if (data.status === 'successful' || data.status === 'completed') {
                    _setCart([]);
                    updateCartUI();
                    _closeCartModal();
                    if (typeof window.rewardUserForAction === 'function') window.rewardUserForAction('SUCCESSFUL_ESCROW_BUYER');

                    // Server-side verified order creation — this is what
                    // actually persists the escrow order and triggers the
                    // seller-notified / buyer-payment-confirmation emails
                    // (see server.js's /api/marketplace/order/confirm and
                    // _watchMarketplaceOrdersForEmail). The Flutterwave
                    // widget's own "successful" callback is a client-side
                    // signal only — this call re-verifies the same tx_ref
                    // server-side with the secret key before anything is
                    // written to Firestore or anyone is emailed.
                    fetch('/api/marketplace/order/confirm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            txRef: data.tx_ref || data.transaction_ref,
                            items: cart.map(function (item) {
                                return { id: item.id, name: item.name, price: item.price, currency: item.currency, sellerId: item.sellerId };
                            }),
                            buyerId: (_us().id || ''),
                            buyerName: buyerName,
                            buyerEmail: buyerEmail,
                            buyerPhone: buyerPhone
                        })
                    }).then(function (r) { return r.json(); }).then(function (result) {
                        if (result && result.ok) {
                            _notify('✅ Payment successful! Seller notified. You have 48hrs to confirm delivery.', 'success');
                        } else {
                            console.error('[Marketplace] order confirm failed:', result);
                            _notify('Payment succeeded, but we couldn\u2019t verify/record the order automatically. Contact support with your reference: ' + (data.tx_ref || data.transaction_ref || 'unknown') + '.', 'warning');
                        }
                    }).catch(function (err) {
                        console.error('[Marketplace] order confirm request failed:', err);
                        _notify('Payment succeeded, but we couldn\u2019t reach the server to record it. Contact support with your reference: ' + (data.tx_ref || data.transaction_ref || 'unknown') + '.', 'warning');
                    });
                } else {
                    _notify('Payment was not completed. Please try again.', 'error');
                }
            },
            onclose: function () {}
        });
    }
    window._doFlutterwaveCheckout = _doFlutterwaveCheckout;

    /* =========================================================================
       §7b  BUYER "CONFIRM RECEIPT" — releases escrow funds to the seller.
       Called from wherever the buyer's order-history UI lives; exposed
       globally (same convention as _doFlutterwaveCheckout above) rather
       than wired to a specific button here, since no existing "My Orders"
       screen/markup was found to attach it to — hook this up to whatever
       button that view uses, e.g.:
         <button onclick="window._empMktConfirmReceipt('ORDER_ID')">
       Fires the escrow-released email server-side (see server.js's
       _watchMarketplaceOrdersForEmail) once the status flip succeeds.
       ========================================================================= */
    function _empMktConfirmReceipt(orderId) {
        var us = _us();
        if (!orderId) { _notify('Missing order id.', 'error'); return Promise.resolve(false); }
        return fetch('/api/marketplace/order/' + encodeURIComponent(orderId) + '/confirm-receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buyerId: us.id || '' })
        }).then(function (r) { return r.json(); }).then(function (result) {
            if (result && result.ok) {
                _notify('✅ Delivery confirmed — funds released to the seller.', 'success');
                return true;
            }
            _notify(result && result.error ? result.error : 'Could not confirm receipt.', 'error');
            return false;
        }).catch(function (err) {
            console.error('[Marketplace] confirm-receipt request failed:', err);
            _notify('Could not reach the server to confirm receipt.', 'error');
            return false;
        });
    }
    window._empMktConfirmReceipt = _empMktConfirmReceipt;

    /* =========================================================================
       §7c  SELLER "MARK AS DISPATCHED" — flips a paid order to 'dispatched'
       so the buyer's Orders pane reflects it. No email is sent for this
       transition (see server.js's _watchMarketplaceOrdersForEmail — only
       payment-received and funds-released were requested). Exposed
       globally, same convention as _empMktConfirmReceipt above; called
       from the seller's Orders pane (app-marketplace-sellers.js).
       ========================================================================= */
    function _empMktMarkDispatched(orderId) {
        var us = _us();
        if (!orderId) { _notify('Missing order id.', 'error'); return Promise.resolve(false); }
        return fetch('/api/marketplace/order/' + encodeURIComponent(orderId) + '/mark-dispatched', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sellerId: us.id || '' })
        }).then(function (r) { return r.json(); }).then(function (result) {
            if (result && result.ok) {
                _notify('📦 Marked as dispatched.', 'success');
                return true;
            }
            _notify(result && result.error ? result.error : 'Could not mark as dispatched.', 'error');
            return false;
        }).catch(function (err) {
            console.error('[Marketplace] mark-dispatched request failed:', err);
            _notify('Could not reach the server to mark as dispatched.', 'error');
            return false;
        });
    }
    window._empMktMarkDispatched = _empMktMarkDispatched;

    function _closeCartModal() {
        var m = document.getElementById('cart-modal-container') || document.getElementById('cart-modal-overlay');
        if (m) { m.classList.remove('show'); m.style.display = 'none'; }
        document.body.classList.remove('modal-open');
    }

    /* Open cart modal helper */
    function _openCartModal() {
        updateCartUI();
        var m = document.getElementById('cart-modal-container') || document.getElementById('cart-modal-overlay');
        if (m) { m.style.display = 'flex'; m.classList.add('show'); document.body.classList.add('modal-open'); }
    }
    window.openCartModal  = _openCartModal;
    window.closeCartModal = _closeCartModal;


    /* =========================================================================
       §8  MARKETPLACE EDIT MODAL — inject if missing
       ========================================================================= */
    function _ensureEditModal() {
        if (document.getElementById('mkt-edit-modal')) return;
        var modal = document.createElement('div');
        modal.id = 'mkt-edit-modal';
        modal.className = 'modal-overlay-container';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;';
        modal.innerHTML = [
            '<div class="modal-card" style="background:#fff;border-radius:16px;padding:28px;width:90%;max-width:480px;max-height:90vh;overflow-y:auto;">',
            '<h3 style="margin:0 0 20px;font-size:1.1rem;"><i class="fas fa-edit" style="color:#00D4AA;margin-right:8px;"></i>Edit Listing</h3>',
            '<div class="form-group"><label>Title</label><input type="text" id="mkt-edit-name" class="form-control"></div>',
            '<div class="form-group"><label>Price</label><input type="number" id="mkt-edit-price" class="form-control" min="0" step="0.01"></div>',
            '<div class="form-group"><label>Description</label><textarea id="mkt-edit-desc" class="form-control" rows="4" style="resize:vertical;"></textarea></div>',
            '<input type="hidden" id="mkt-edit-id">',
            '<input type="hidden" id="mkt-edit-collection" value="marketplace_listings">',
            '<div style="display:flex;gap:12px;margin-top:20px;">',
            '<button type="button" id="mkt-edit-save-btn" class="btn btn-accent" style="flex:1;"><i class="fas fa-save"></i> Save Changes</button>',
            '<button type="button" id="mkt-edit-cancel-btn" class="btn" style="flex:1;"><i class="fas fa-times"></i> Cancel</button>',
            '</div></div>'
        ].join('');
        document.body.appendChild(modal);

        modal.querySelector('#mkt-edit-cancel-btn').addEventListener('click', function () {
            modal.style.display = 'none';
            modal.classList.remove('show');
        });

        modal.addEventListener('click', function (e) {
            if (e.target === modal) { modal.style.display = 'none'; modal.classList.remove('show'); }
        });

        modal.querySelector('#mkt-edit-save-btn').addEventListener('click', async function () {
            var itemId  = document.getElementById('mkt-edit-id').value;
            var newName = document.getElementById('mkt-edit-name').value.trim();
            var newPriceStr = document.getElementById('mkt-edit-price').value;
            var newDesc = document.getElementById('mkt-edit-desc').value.trim();
            var newPrice = parseFloat(newPriceStr) || 0;

            if (!newName) { _notify('Please enter a title.', 'error'); return; }

            /* Update card in DOM */
            document.querySelectorAll('[data-post-id="' + itemId + '"],[data-id="' + itemId + '"]')
                .forEach(function (el) {
                    var h4 = el.querySelector('h4, .property-name');
                    var priceDiv = el.querySelector('.property-info div:last-child, .price-display');
                    if (h4) h4.textContent = newName;
                    if (priceDiv) priceDiv.textContent = _fmtPrice(newPrice, el.dataset.currency || 'NGN');
                    el.dataset.price = newPrice;
                    var descEl = el.querySelector('.item-description, .property-desc');
                    if (descEl) descEl.textContent = newDesc;
                });

            /* Firestore update */
            if (window.fbDb && itemId) {
                try {
                    await window.fbDb.collection('marketplace_listings').doc(itemId).update({
                        name: newName, price: newPrice, description: newDesc,
                        updatedAt: new Date().toISOString()
                    });
                    _notify('✅ Listing updated!', 'success');
                } catch (e) {
                    _notify('Updated locally. Cloud sync may be delayed.', 'info');
                }
            } else {
                _notify('Listing updated locally.', 'success');
            }

            modal.style.display = 'none';
            modal.classList.remove('show');
        });
    }


    /* =========================================================================
       §8b  AUTO-REPLY PRESET MODAL
       Lets a seller set/clear the canned response for a listing that fires
       instantly when a buyer taps a price/availability quick-reply chip.
       ========================================================================= */
    function _ensureAutoReplyModal() {
        if (document.getElementById('mkt-autoreply-modal')) return;
        var modal = document.createElement('div');
        modal.id = 'mkt-autoreply-modal';
        modal.className = 'modal-overlay-container';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;';
        modal.innerHTML = [
            '<div class="modal-card" style="background:#fff;border-radius:16px;padding:28px;width:90%;max-width:440px;">',
            '<h3 style="margin:0 0 8px;font-size:1.1rem;"><i class="fas fa-bolt" style="color:#00A886;margin-right:8px;"></i>Auto-Reply</h3>',
            '<p style="margin:0 0 16px;font-size:0.82rem;color:var(--text-muted);">When a buyer asks the price or availability, they\'ll get this instantly.</p>',
            '<div class="form-group"><label>Response message</label>',
            '<textarea id="mkt-autoreply-text" class="form-control" rows="4" placeholder="e.g. This item is ₦25,000 and still available. Message me to arrange pickup!" style="resize:vertical;"></textarea></div>',
            '<label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.85rem;">',
            '<input type="checkbox" id="mkt-autoreply-enabled"> Enabled',
            '</label>',
            '<input type="hidden" id="mkt-autoreply-listing-id">',
            '<div style="display:flex;gap:12px;margin-top:20px;">',
            '<button type="button" id="mkt-autoreply-save-btn" class="btn btn-accent" style="flex:1;"><i class="fas fa-save"></i> Save</button>',
            '<button type="button" id="mkt-autoreply-cancel-btn" class="btn" style="flex:1;"><i class="fas fa-times"></i> Cancel</button>',
            '</div></div>'
        ].join('');
        document.body.appendChild(modal);

        function _close() { modal.style.display = 'none'; modal.classList.remove('show'); }
        modal.querySelector('#mkt-autoreply-cancel-btn').addEventListener('click', _close);
        modal.addEventListener('click', function (e) { if (e.target === modal) _close(); });

        modal.querySelector('#mkt-autoreply-save-btn').addEventListener('click', function () {
            var listingId = document.getElementById('mkt-autoreply-listing-id').value;
            var enabled   = document.getElementById('mkt-autoreply-enabled').checked;
            var text      = document.getElementById('mkt-autoreply-text').value.trim();
            if (!listingId) { _close(); return; }

            _setListingAutoReply(listingId, enabled && text ? text : '');

            document.querySelectorAll('.mkt-autoreply-btn[data-listing-id="' + listingId + '"]').forEach(function (btn) {
                var on = !!_getListingAutoReply(listingId);
                btn.innerHTML = '<i class="fas fa-bolt"></i> ' + (on ? 'Auto-Reply ✓' : 'Auto-Reply');
            });
            _notify(enabled && text ? '✅ Auto-reply saved.' : 'Auto-reply cleared.', 'success');
            _close();
        });
    }

    function _openAutoReplyModal(listingId) {
        _ensureAutoReplyModal();
        var modal = document.getElementById('mkt-autoreply-modal');
        var preset = _getListingAutoReply(listingId);
        document.getElementById('mkt-autoreply-listing-id').value = listingId;
        document.getElementById('mkt-autoreply-text').value = preset ? preset.message : '';
        document.getElementById('mkt-autoreply-enabled').checked = !!(preset && preset.enabled);
        modal.style.display = 'flex';
        modal.classList.add('show');
        document.getElementById('mkt-autoreply-text').focus();
    }


    /* =========================================================================
       §8c  MARKETPLACE MESSAGES INBOX
       A dedicated conversation list for marketplace inquiries — kept
       separate from the general Chats tab (see §1b). Pulls from Firestore
       'marketplace_messages' (buyer-side + seller-side queries merged) with
       a localStorage fallback for offline/no-Firebase sessions.
       ========================================================================= */
    function _mktInboxLocalEntries() {
        var store = {};
        try { store = JSON.parse(localStorage.getItem('empyrean_market_msgs') || '{}'); } catch (e) {}
        var us = _us();
        return Object.keys(store).map(function (tid) { return store[tid].meta; })
            .filter(function (m) { return m && (m.buyerId === us.id || m.sellerId === us.id) && m.lastMessage; });
    }

    function _mktUnreadTotal(cb) {
        var us = _us();
        if (!us.id) { cb(0); return; }
        var db = window.fbDb;
        if (!db) { cb(0); return; }
        Promise.all([
            db.collection('marketplace_messages').where('buyerId', '==', us.id).get().catch(function () { return { docs: [] }; }),
            db.collection('marketplace_messages').where('sellerId', '==', us.id).get().catch(function () { return { docs: [] }; })
        ]).then(function (results) {
            var total = 0;
            results[0].docs.forEach(function (d) { total += (d.data().unreadBuyer || 0); });
            results[1].docs.forEach(function (d) { total += (d.data().unreadSeller || 0); });
            cb(total);
        }).catch(function () { cb(0); });
    }

    function _ensureMarketplaceInboxModal() {
        if (document.getElementById('mkt-inbox-modal')) return;
        if (!document.getElementById('_mkt_inbox_css')) {
            var css = document.createElement('style');
            css.id = '_mkt_inbox_css';
            css.textContent = [
                '#mkt-inbox-modal .mkt-inbox-card{background:#fff;border-radius:16px;width:92%;max-width:460px;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;}',
                '#mkt-inbox-modal .mkt-inbox-header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid rgba(10,14,39,0.08);flex-shrink:0;}',
                '#mkt-inbox-modal .mkt-inbox-header h3{margin:0;font-size:1.05rem;}',
                '#mkt-inbox-modal .mkt-inbox-close{background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--text-muted);}',
                '#mkt-inbox-modal .mkt-inbox-list{overflow-y:auto;flex:1;}',
                '#mkt-inbox-modal .mkt-inbox-row{display:flex;gap:12px;align-items:center;padding:12px 18px;cursor:pointer;border-bottom:1px solid rgba(10,14,39,0.05);}',
                '#mkt-inbox-modal .mkt-inbox-row:hover{background:rgba(27,43,139,0.04);}',
                '#mkt-inbox-modal .mkt-inbox-row img{width:44px;height:44px;border-radius:10px;object-fit:cover;flex-shrink:0;background:#eef0fa;}',
                '#mkt-inbox-modal .mkt-inbox-row-info{flex:1;min-width:0;}',
                '#mkt-inbox-modal .mkt-inbox-row-info strong{display:block;font-size:0.88rem;color:var(--primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
                '#mkt-inbox-modal .mkt-inbox-row-info p{margin:2px 0 0;font-size:0.78rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
                '#mkt-inbox-modal .mkt-inbox-badge{background:#EF4444;color:#fff;font-size:0.68rem;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 5px;flex-shrink:0;}',
                '#mkt-inbox-modal .mkt-inbox-empty{text-align:center;padding:48px 20px;color:var(--text-muted);}',
                '#mkt-fab-btn{position:fixed;bottom:88px;right:18px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#1B2B8B,#0A0E27);color:#fff;border:none;box-shadow:0 6px 18px rgba(10,14,39,0.28);z-index:9998;display:flex;align-items:center;justify-content:center;font-size:1.15rem;cursor:pointer;}',
                '#mkt-fab-btn .mkt-fab-badge{position:absolute;top:-2px;right:-2px;background:#EF4444;color:#fff;font-size:0.62rem;font-weight:700;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;border:2px solid #fff;}',
            ].join('');
            document.head.appendChild(css);
        }
        var modal = document.createElement('div');
        modal.id = 'mkt-inbox-modal';
        modal.className = 'modal-overlay-container';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;';
        modal.innerHTML = [
            '<div class="mkt-inbox-card">',
            '  <div class="mkt-inbox-header"><h3><i class="fas fa-comment-dollar" style="color:#1B2B8B;margin-right:8px;"></i>Marketplace Messages</h3>',
            '  <button class="mkt-inbox-close">&times;</button></div>',
            '  <div class="mkt-inbox-list" id="mkt-inbox-list"><div class="mkt-inbox-empty">Loading…</div></div>',
            '</div>'
        ].join('');
        document.body.appendChild(modal);
        modal.querySelector('.mkt-inbox-close').addEventListener('click', function () {
            modal.style.display = 'none'; modal.classList.remove('show');
        });
        modal.addEventListener('click', function (e) { if (e.target === modal) { modal.style.display = 'none'; modal.classList.remove('show'); } });
    }

    function renderMarketplaceInbox() {
        _ensureMarketplaceInboxModal();
        var list = document.getElementById('mkt-inbox-list');
        var us = _us();
        var db = window.fbDb;

        function _renderRows(rows) {
            rows = rows.filter(function (r) { return r && r.lastMessage; })
                .sort(function (a, b) { return new Date(b.lastTs || 0) - new Date(a.lastTs || 0); });
            if (!rows.length) {
                list.innerHTML = '<div class="mkt-inbox-empty"><i class="fas fa-comment-dollar" style="font-size:2rem;display:block;margin-bottom:10px;opacity:0.3;"></i>No marketplace conversations yet.</div>';
                return;
            }
            list.innerHTML = '';
            rows.forEach(function (r) {
                var isBuyerSide = r.buyerId === us.id;
                var counterpartId = isBuyerSide ? r.sellerId : r.buyerId;
                var unread = isBuyerSide ? (r.unreadBuyer || 0) : (r.unreadSeller || 0);
                var counterpartName = (window._mktProfileCache && window._mktProfileCache[counterpartId] && window._mktProfileCache[counterpartId].fullName)
                    || (isBuyerSide ? 'Seller' : 'Buyer');
                var row = document.createElement('div');
                row.className = 'mkt-inbox-row';
                row.innerHTML =
                    '<img src="' + _esc(r.listingImage || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(counterpartName) + '&background=1B2B8B&color=fff')) + '" alt="">'
                    + '<div class="mkt-inbox-row-info"><strong>' + _esc(r.listingName || counterpartName) + '</strong>'
                    + '<p>' + _esc((r.lastMessage || '').slice(0, 60)) + '</p></div>'
                    + (unread > 0 ? '<span class="mkt-inbox-badge">' + (unread > 9 ? '9+' : unread) + '</span>' : '');
                row.addEventListener('click', function () {
                    document.getElementById('mkt-inbox-modal').style.display = 'none';
                    document.getElementById('mkt-inbox-modal').classList.remove('show');
                    _openMarketChatOverlay(counterpartId, counterpartName, {
                        id: r.listingId, name: r.listingName, price: r.listingPrice, image: r.listingImage, buyerId: r.buyerId, category: r.listingCategory || ''
                    });
                });
                list.appendChild(row);
            });
        }

        if (db && us.id) {
            Promise.all([
                db.collection('marketplace_messages').where('buyerId', '==', us.id).get().catch(function () { return { docs: [] }; }),
                db.collection('marketplace_messages').where('sellerId', '==', us.id).get().catch(function () { return { docs: [] }; })
            ]).then(function (results) {
                var rows = results[0].docs.concat(results[1].docs).map(function (d) { return d.data(); });
                _renderRows(rows.length ? rows : _mktInboxLocalEntries());
            }).catch(function () { _renderRows(_mktInboxLocalEntries()); });
        } else {
            _renderRows(_mktInboxLocalEntries());
        }
    }
    window.renderMarketplaceInbox = renderMarketplaceInbox;

    function openMarketplaceMessages() {
        var us = _us();
        if (!us.id) { if (typeof window.openAuthModal === 'function') window.openAuthModal('login'); return; }
        _ensureMarketplaceInboxModal();
        var modal = document.getElementById('mkt-inbox-modal');
        modal.style.display = 'flex';
        modal.classList.add('show');
        renderMarketplaceInbox();
    }
    window.openMarketplaceMessages = openMarketplaceMessages;

    /* Floating entry-point button with unread badge — appears once a user
       is signed in, refreshes its badge count periodically. */
    function _ensureMarketplaceFab() {
        if (_isGuest() || document.getElementById('mkt-fab-btn')) return;
        var fab = document.createElement('button');
        fab.id = 'mkt-fab-btn';
        fab.title = 'Marketplace Messages';
        fab.innerHTML = '<i class="fas fa-comment-dollar"></i>';
        fab.addEventListener('click', openMarketplaceMessages);
        document.body.appendChild(fab);
        _refreshMarketplaceFabBadge();
    }
    function _refreshMarketplaceFabBadge() {
        var fab = document.getElementById('mkt-fab-btn');
        if (!fab) return;
        _mktUnreadTotal(function (total) {
            var badge = fab.querySelector('.mkt-fab-badge');
            if (total > 0) {
                if (!badge) { badge = document.createElement('span'); badge.className = 'mkt-fab-badge'; fab.appendChild(badge); }
                badge.textContent = total > 9 ? '9+' : total;
            } else if (badge) { badge.remove(); }
        });
    }
    document.addEventListener('empyrean-init-done', function () {
        setTimeout(_ensureMarketplaceFab, 900);
    });
    document.addEventListener('empyrean-user-ready', function () {
        setTimeout(_ensureMarketplaceFab, 300);
    });
    setInterval(_refreshMarketplaceFabBadge, 15000);


    /* =========================================================================
       §9  EVENT DELEGATION
       ========================================================================= */
    document.addEventListener('click', function (e) {
        var t = e.target;

        /* ── Gallery thumbnail ── */
        var thumb = t.closest('.gallery-thumbnail');
        if (thumb && thumb.dataset.index != null) {
            e.preventDefault();
            _stopGalleryVideo();
            _setMgs({ currentIndex: parseInt(thumb.dataset.index, 10) });
            renderMarketplaceGalleryView();
            return;
        }

        /* ── Gallery nav ── */
        if (t.id === 'gallery-prev-btn' || t.closest('#gallery-prev-btn')) { e.preventDefault(); navigateMarketplaceGallery(-1); return; }
        if (t.id === 'gallery-next-btn' || t.closest('#gallery-next-btn')) { e.preventDefault(); navigateMarketplaceGallery(1);  return; }

        /* ── Close gallery ── */
        var galModal = document.getElementById('marketplace-gallery-modal');
        if (galModal && galModal.classList.contains('show')) {
            if (t.closest('.close-modal, .close-gallery-btn, #gallery-close-btn') || (t === galModal)) {
                e.preventDefault(); _closeGallery(); return;
            }
        }

        /* ── Add to cart ── */
        var addBtn = t.closest('.add-to-cart-btn');
        if (addBtn) {
            e.preventDefault();
            if (_isGuest()) { if (typeof window.openAuthModal === 'function') window.openAuthModal('login'); return; }
            var card = addBtn.closest('.property-card');
            if (!card) return;
            var cart = _cart();
            var itemId = card.dataset.id || card.dataset.postId || ('item-' + Date.now());
            if (cart.find(function (i) { return i.id === itemId; })) {
                _notify('Already in cart!', 'info'); return;
            }
            var mediaArr = [];
            try { mediaArr = JSON.parse(card.dataset.media || '[]'); } catch (_) {}
            var firstImg = card.querySelector('img');
            cart.push({
                id:       itemId,
                name:     card.dataset.name || (card.querySelector('h4, .property-name') || {}).textContent || 'Item',
                price:    card.dataset.price || '0',
                currency: card.dataset.displayCurrency || card.dataset.currency || 'NGN',
                img:      (mediaArr[0]) || (firstImg ? firstImg.src : '') || '',
                sellerId: card.dataset.sellerId || ''
            });
            _setCart(cart);
            updateCartUI();
            _notify('✅ Added to cart!', 'success');
            return;
        }

        /* ── Remove from cart ── */
        var rmBtn = t.closest('.remove-cart-item-btn');
        if (rmBtn) {
            e.preventDefault();
            var id = rmBtn.dataset.id;
            _setCart(_cart().filter(function (i) { return i.id !== id; }));
            updateCartUI();
            return;
        }

        /* ── Open cart ── */
        if (t.closest('.cart-icon-button, #cart-icon-btn')) {
            e.preventDefault(); _openCartModal(); return;
        }

        /* ── Close cart ── */
        var cartEl = document.getElementById('cart-modal-container') || document.getElementById('cart-modal-overlay');
        if (cartEl && cartEl.classList.contains('show')) {
            if (t.closest('#close-cart-btn, .close-cart-btn, .close-modal') || t === cartEl) {
                e.preventDefault(); _closeCartModal(); return;
            }
        }

        /* ── Back to cart (from checkout) ── */
        if (t.closest('#back-to-cart-btn, .back-to-cart-btn')) {
            e.preventDefault();
            var cv = document.getElementById('cart-view');
            var chv = document.getElementById('checkout-view');
            if (cv)  cv.style.display  = 'block';
            if (chv) chv.style.display = 'none';
            return;
        }

        /* ── Proceed to checkout ── */
        if (t.closest('.checkout-btn')) {
            e.preventDefault();
            var cart2 = _cart();
            if (!cart2.length) { _notify('Your cart is empty.', 'warning'); return; }
            var cv2  = document.getElementById('cart-view');
            var chv2 = document.getElementById('checkout-view');
            if (cv2)  cv2.style.display  = 'none';
            if (chv2) chv2.style.display = 'block';
            return;
        }

        /* ── Complete payment (inside checkout form) ── */
        if (t.closest('#checkout-pay-btn, .complete-payment-btn, [data-action="pay"]')) {
            e.preventDefault(); _doFlutterwaveCheckout(); return;
        }

        /* ── Promote ── */
        var proBtn = t.closest('.promote-post-btn, .promote-item-btn');
        if (proBtn) {
            e.preventDefault();
            var pEl = proBtn.closest('[data-post-id],[data-id]');
            var proSellerId = pEl ? (pEl.dataset.sellerId || pEl.dataset.userId || '') : '';
            var proUs = _us();
            if (!_isAdmin() && proSellerId && proSellerId !== proUs.id) {
                _notify('You can only promote your own listings.', 'warning'); return;
            }
            promptForPromotion(pEl ? (pEl.dataset.postId || pEl.dataset.id) : null);
            return;
        }

        /* ── Edit marketplace listing ── */
        var editBtn = t.closest('.edit-post-btn');
        if (editBtn) {
            var propCard = editBtn.closest('.property-card');
            if (!propCard) return; /* Let app-fixes.js handle non-marketplace edits */
            e.preventDefault();
            e.stopPropagation();
            var sellerId = propCard.dataset.sellerId || '';
            var us = _us();
            if (!_isAdmin() && sellerId && sellerId !== us.id) {
                _notify('You can only edit your own listings.', 'warning'); return;
            }
            _ensureEditModal();
            var modal = document.getElementById('mkt-edit-modal');
            var itemId2 = propCard.dataset.id || propCard.dataset.postId || '';
            document.getElementById('mkt-edit-id').value    = itemId2;
            document.getElementById('mkt-edit-name').value  = (propCard.querySelector('h4, .property-name') || {}).textContent || '';
            document.getElementById('mkt-edit-price').value = propCard.dataset.price || '';
            document.getElementById('mkt-edit-desc').value  = (propCard.querySelector('.item-description, .property-desc') || {}).textContent || '';
            modal.style.display = 'flex';
            modal.classList.add('show');
            return;
        }

        /* ── Delete marketplace listing ── */
        var delBtn2 = t.closest('.delete-post-btn');
        if (delBtn2) {
            var propCard2 = delBtn2.closest('.property-card');
            if (!propCard2) return;
            e.preventDefault();
            e.stopPropagation();
            var sellerId2 = propCard2.dataset.sellerId || '';
            var us2 = _us();
            if (!_isAdmin() && sellerId2 && sellerId2 !== us2.id) {
                _notify('You can only delete your own listings.', 'warning'); return;
            }
            if (!confirm('Delete this listing? This cannot be undone.')) return;
            var docId2 = propCard2.dataset.id || propCard2.dataset.postId || '';
            propCard2.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            propCard2.style.opacity = '0';
            propCard2.style.transform = 'scale(0.95)';
            setTimeout(function () {
                document.querySelectorAll('[data-id="' + docId2 + '"],[data-post-id="' + docId2 + '"]')
                    .forEach(function (el) { el.remove(); });
            }, 320);
            if (window.fbDb && docId2) {
                try {
                    window.fbDb.collection('marketplace_listings').doc(docId2).delete();
                    _notify('✅ Listing deleted.', 'success');
                } catch (err) {
                    _notify('Removed from view.', 'info');
                }
            } else {
                _notify('Listing removed.', 'success');
            }
            return;
        }

        /* ── Seller: open Auto-Reply preset modal ── */
        var autoReplyBtn = t.closest('.mkt-autoreply-btn');
        if (autoReplyBtn) {
            e.preventDefault();
            e.stopPropagation();
            var arListingId = autoReplyBtn.dataset.listingId;
            if (arListingId) _openAutoReplyModal(arListingId);
            return;
        }

        /* ── Contact seller / Message Seller button — DISABLED ──
           This used to toggle the .direct-contact-info panel directly.
           app-patch-v2.js's patchMarketplaceContact (§P3, loads later in
           index.html) now owns this button exclusively: it builds the
           same panel (animated, with Firestore fallback + loading state)
           via its own addEventListener on each card, independent of this
           delegated handler. Having both wired meant every tap fired
           twice and the two panels fought over the same innerHTML.
           Left here disabled rather than deleted in case app-patch-v2.js
           is ever removed and this needs to be the fallback again. */
        /*
        var contactBtn = t.closest('.contact-seller-btn, .expand-contact-btn, .vf-chat-seller-btn');
        if (contactBtn) {
            e.preventDefault(); e.stopPropagation();
            if (_isGuest()) { if (typeof window.openAuthModal === 'function') window.openAuthModal('login'); return; }
            var cardEl   = contactBtn.closest('.property-card') || contactBtn.closest('.market-card') || contactBtn.closest('.listing-card');
            var sellerId = (cardEl && (cardEl.dataset.sellerId || cardEl.dataset.userId)) || contactBtn.dataset.sellerId || '';
            var sellerName = (cardEl && (cardEl.dataset.sellerName || cardEl.dataset.contactName)) ||
                             contactBtn.dataset.sellerName ||
                             (cardEl && (cardEl.querySelector('h4,.property-name') || {}).textContent) || 'Seller';
            var us = _us();
            var isOwner = _isAdmin() || (us.id && sellerId && sellerId === us.id);
            if (cardEl) {
                var directInfo = cardEl.querySelector('.direct-contact-info');
                if (!directInfo) { directInfo = document.createElement('div'); directInfo.className = 'direct-contact-info'; cardEl.appendChild(directInfo); }
                var isOpen = directInfo.classList.contains('open');
                if (isOpen) {
                    directInfo.classList.remove('open');
                    contactBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:5px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Contact Seller';
                } else {
                    var cName=cardEl.dataset.contactName||'', cPhone=cardEl.dataset.contactPhone||'', cEmail=cardEl.dataset.contactEmail||'', cAddr=cardEl.dataset.contactAddress||'';
                    var chatBtnHtml = (!isOwner && sellerId)
                        ? '<button type="button" class="btn mkt-msg-seller-btn" style="margin-top:8px;width:100%;"><i class="fas fa-comment-dots"></i> Message Seller</button>'
                        : '';
                    directInfo.innerHTML = (cName||cPhone||cEmail||cAddr)
                        ? ['<p style="font-weight:700;margin-bottom:8px;">Seller Contact</p>',
                           cName?'<p>'+_esc(cName)+'</p>':'',
                           cPhone?'<p><a href="tel:'+_esc(cPhone)+'">'+_esc(cPhone)+'</a></p>':'',
                           cEmail?'<p><a href="mailto:'+_esc(cEmail)+'">'+_esc(cEmail)+'</a></p>':'',
                           cAddr?'<p>'+_esc(cAddr)+'</p>':'',
                           chatBtnHtml].join('')
                        : '<p>No contact details posted.</p>' + chatBtnHtml;
                    directInfo.classList.add('open');
                    contactBtn.innerHTML = 'Hide Contact';
                }
            }
            return;
        }
        */

        /* ── In-panel "Message Seller" button — DORMANT (request —
           Communication Adjustments, 2026-08-09: "remove direct message
           inbox"). Nothing in this file creates a `.mkt-msg-seller-btn`
           element any more — _ensureMessageSellerButton above now builds
           a `.mkt-call-seller-btn` tel: link instead. Listener left in
           place (harmless no-op) rather than deleted, per this codebase's
           no-deletion convention, in case some other file/older cached
           listing markup still emits that class. */
        var inPanelChatBtn = t.closest('.mkt-msg-seller-btn');
        if (inPanelChatBtn) {
            e.preventDefault(); e.stopPropagation();
            if (_isGuest()) { if (typeof window.openAuthModal === 'function') window.openAuthModal('login'); return; }
            var chatCardEl = inPanelChatBtn.closest('.property-card') || inPanelChatBtn.closest('.market-card') || inPanelChatBtn.closest('.listing-card');
            var chatSellerId = (chatCardEl && (chatCardEl.dataset.sellerId || chatCardEl.dataset.userId)) || '';
            var chatSellerName = (chatCardEl && (chatCardEl.dataset.sellerName || chatCardEl.dataset.contactName)) ||
                                  (chatCardEl && (chatCardEl.querySelector('h4,.property-name') || {}).textContent) || 'Seller';
            var chatListingMeta = null;
            if (chatCardEl) {
                var lMedia = [];
                try { lMedia = JSON.parse(chatCardEl.dataset.media || '[]'); } catch (_e) {}
                var lImg = lMedia[0] || (chatCardEl.querySelector('img') || {}).src || '';
                chatListingMeta = {
                    id:    chatCardEl.dataset.id || chatCardEl.dataset.postId || '',
                    name:  chatCardEl.dataset.name || (chatCardEl.querySelector('h4,.property-name') || {}).textContent || '',
                    price: chatCardEl.dataset.price
                        ? _fmtPrice(chatCardEl.dataset.price, chatCardEl.dataset.displayCurrency || chatCardEl.dataset.currency || 'NGN')
                        : '',
                    image: lImg,
                    /* FIX (request — "tailor the automated message response
                       section to match job and services category"): lets
                       _openMarketChatOverlay pick job/service-appropriate
                       quick-reply chips instead of the generic
                       product-sale phrasing. */
                    category: chatCardEl.dataset.category || ''
                };
            }
            if (chatSellerId) _openMarketChatOverlay(chatSellerId, chatSellerName.trim(), chatListingMeta);
            return;
        }

        /* ── Promo budget live preview ── */
        var budgetEl = document.getElementById('promo-budget');
        if (budgetEl && t === budgetEl) updatePromoReachPreview();
    });

    document.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'promo-budget') updatePromoReachPreview();
    });

    document.addEventListener('keydown', function (e) {
        var modal = document.getElementById('marketplace-gallery-modal');
        if (!modal || !modal.classList.contains('show')) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); navigateMarketplaceGallery(1);  }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); navigateMarketplaceGallery(-1); }
        if (e.key === 'Escape')     { e.preventDefault(); _closeGallery();                }
    });

    /* =========================================================================
       §CAT  MARKETPLACE CATEGORIES — unified category tree (used by the Home
             browse tiles, the Sell-tab accordion category step, and the
             filter/sort toolbar), a two-step Sell flow (accordion category
             picker → category-specific "Ad Details" form), and the category
             badges/quick-specs shown on listing cards.

       Each top-level category renders its own distinct set of Ad Details
       columns (Vehicles: Year/Brand/Model/Type/Mileage/Features;
       Properties: Property Type/Bedrooms/Bathrooms/Amenities; Gadgets:
       Item Type/Specs/Warranty; Others: just an optional Condition —
       Title/Description/Price/Location stay common to every category).
       See MKT_CATEGORY_FIELD_SCHEMAS / _mktRenderDynamicFields() below.

       Data model: listingData.category / listingData.subcategory (strings)
       and listingData.categoryFields (an object whose keys vary by
       category — see each schema's field keys) — read by app-fixes.js's
       marketplace-form submit handler via window._collectMarketplaceCategoryFields(),
       and rendered onto cards via window._mktCategoryBadgeHTML() / window._mktQuickSpecsHTML().
       ========================================================================= */

    /* Small inline-SVG icon set — used instead of Font Awesome glyph classes
       for every icon this module owns. Font Awesome's icon font intermittently
       fails to load (a recurring, documented issue app-wide), and several of
       the glyphs used here (car, box, briefcase, baby, paw, seedling, hard
       hat, pump-soap…) have no Unicode emoji fallback, so a font failure
       renders them as a blank "tofu" box — inline SVG can't fail to load. */
    var MKT_ICONS = {
        car:      '<path d="M4 16l1.2-5.2A2 2 0 0 1 7.14 9.2h9.72a2 2 0 0 1 1.94 1.6L20 16"/><path d="M3 16h18v2.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V18H6.5v.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V16Z"/><circle cx="7" cy="17.5" r="1.4"/><circle cx="17" cy="17.5" r="1.4"/>',
        home:     '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
        phone:    '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
        laptop:   '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M2 18h20"/>',
        couch:    '<path d="M4 13V8a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1h4V8a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5"/><path d="M3 13h18v4a1 1 0 0 1-1 1h-1v2h-2v-2H7v2H5v-2H4a1 1 0 0 1-1-1v-4Z"/>',
        droplet:  '<path d="M12 2s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/>',
        shirt:    '<path d="M8 3 4 6l2 3 2-1v11h8V8l2 1 2-3-4-3-2 2h-4L8 3Z"/>',
        ball:     '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>',
        briefcase:'<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        doc:      '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/>',
        baby:     '<circle cx="12" cy="8" r="4"/><path d="M6 21c0-4 3-6 6-6s6 2 6 6"/>',
        paw:      '<circle cx="7" cy="8" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="8" r="2"/><path d="M6 15c0-3 3-4 6-4s6 1 6 4-3 4-6 4-6-1-6-4Z"/>',
        leaf:     '<path d="M5 19C5 9 13 4 20 4c0 8-5 15-15 15Z"/><path d="M5 19c2-4 5-7 9-9"/>',
        truck:    '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>',
        wrench:   '<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L14.7 6.3Z"/>',
        box:      '<path d="M3 8l9-4 9 4-9 4-9-4Z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>',
        heart:    '<path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z"/>',
        search:   '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.3-4.3"/>',
        store:    '<path d="M4 8 5 3h14l1 5"/><path d="M4 8v12h16V8"/><path d="M9 20v-6h6v6"/>',
        user:     '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 4-7 8-7s8 2.5 8 7"/>',
        chevron:  '<path d="m6 9 6 6 6-6"/>',
        message:  '<path d="M4 5h16v11H8l-4 4V5Z"/>',
        bag:      '<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'
    };
    function _mktIcon(key, size) {
        size = size || 16;
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="' + size + '" height="' + size + '">' + (MKT_ICONS[key] || MKT_ICONS.box) + '</svg>';
    }
    window._mktIcon = _mktIcon;

    /* Master category tree — top-level category + subcategories. Order and
       top-level list match the reference "Select a category from the list
       below" flow this was modeled on; Vehicles' subcategories match the
       reference exactly, others are reasonable groupings for this platform. */
    var MKT_MASTER_CATEGORIES = [
        { key: 'vehicles',     label: 'Vehicles',                  icon: 'car',      sub: ['Cars', 'Passenger Buses', 'Trucks & Trailers', 'Auto Parts & Accessories', 'Boats & Marine', 'Motorbikes & Scooters', 'Construction Machinery', 'Car Services'] },
        { key: 'properties',   label: 'Properties',                icon: 'home',     sub: ['Apartment', 'House', 'Land', 'Office', 'Warehouse', 'Other'] },
        { key: 'phones',       label: 'Phones & Tablets',          icon: 'phone',    sub: ['Phones', 'Tablets', 'Phone & Tablet Accessories'] },
        { key: 'gadgets',      label: 'Gadgets & Devices',         icon: 'laptop',   sub: ['Laptops & Computers', 'Cameras', 'Audio & Speakers', 'Wearables', 'Other Gadgets'] },
        { key: 'furniture',    label: 'Home & Furniture',          icon: 'couch',    sub: ['Living Room', 'Bedroom', 'Kitchen & Dining', 'Home Décor', 'Appliances'] },
        { key: 'personalcare', label: 'Personal Care',             icon: 'droplet',  sub: ['Skincare', 'Haircare', 'Fragrances', 'Health & Wellness'] },
        { key: 'clothing',     label: 'Clothing & Accessories',    icon: 'shirt',    sub: ['Men\'s Wear', 'Women\'s Wear', 'Shoes', 'Bags', 'Jewelry & Watches'] },
        { key: 'leisure',      label: 'Leisure, Arts & Outdoors',  icon: 'ball',     sub: ['Sports Equipment', 'Musical Instruments', 'Books', 'Camping & Outdoors', 'Art & Crafts'] },
        { key: 'babies',       label: 'Babies & Children',         icon: 'baby',     sub: ['Baby Gear', 'Toys', 'Kids\' Clothing', 'Nursery'] },
        { key: 'pets',         label: 'Pets & Animals',            icon: 'paw',      sub: ['Dogs', 'Cats', 'Birds', 'Pet Supplies'] },
        { key: 'food',         label: 'Food & Farming',            icon: 'leaf',     sub: ['Farm Produce', 'Livestock', 'Farm Equipment', 'Packaged Food'] },
        { key: 'commercial',   label: 'Commercial Equipment',      icon: 'truck',    sub: ['Industrial Machinery', 'Office Equipment', 'Catering Equipment'] },
        { key: 'repair',       label: 'Repair & Construction',     icon: 'wrench',   sub: ['Building Materials', 'Tools', 'Construction Services'] },
        { key: 'professional', label: 'Professional Services',    icon: 'briefcase',sub: ['Consulting', 'Events', 'Design & Media', 'Other Services'] },
        { key: 'jobseeking',   label: 'Job Seeking',               icon: 'doc',      sub: [] },
        { key: 'jobs',         label: 'Jobs',                      icon: 'briefcase',sub: [] },
        { key: 'others',       label: 'Others',                    icon: 'box',      sub: [] }
    ];
    window._MKT_MASTER_CATEGORIES = MKT_MASTER_CATEGORIES;

    function _mktCatDef(key) {
        for (var i = 0; i < MKT_MASTER_CATEGORIES.length; i++) if (MKT_MASTER_CATEGORIES[i].key === key) return MKT_MASTER_CATEGORIES[i];
        return null;
    }


    /* =========================================================================
       §NIGERIA STATES → LGAs  Used for the cascading Location dropdown
       (State → Local Government Area) on every listing, replacing the old
       single free-text Location field.
       ========================================================================= */
    var NIGERIA_STATES_LGAS = {
        'Abia': ['Aba North','Aba South','Arochukwu','Bende','Ikwuano','Isiala Ngwa North','Isiala Ngwa South','Isuikwuato','Obi Ngwa','Ohafia','Osisioma','Ugwunagbo','Ukwa East','Ukwa West','Umuahia North','Umuahia South','Umu Nneochi'],
        'Adamawa': ['Demsa','Fufure','Ganye','Gayuk','Gombi','Grie','Hong','Jada','Lamurde','Madagali','Maiha','Mayo Belwa','Michika','Mubi North','Mubi South','Numan','Shelleng','Song','Toungo','Yola North','Yola South'],
        'Akwa Ibom': ['Abak','Eastern Obolo','Eket','Esit Eket','Essien Udim','Etim Ekpo','Etinan','Ibeno','Ibesikpo Asutan','Ibiono Ibom','Ika','Ikono','Ikot Abasi','Ikot Ekpene','Ini','Itu','Mbo','Mkpat Enin','Nsit Atai','Nsit Ibom','Nsit Ubium','Obot Akara','Okobo','Onna','Oron','Oruk Anam','Udung Uko','Ukanafun','Uruan',"Urue-Offong/Oruko",'Uyo'],
        'Anambra': ['Aguata','Anambra East','Anambra West','Anaocha','Awka North','Awka South','Ayamelum','Dunukofia','Ekwusigo','Idemili North','Idemili South','Ihiala','Njikoka','Nnewi North','Nnewi South','Ogbaru','Onitsha North','Onitsha South','Orumba North','Orumba South','Oyi'],
        'Bauchi': ['Alkaleri','Bauchi','Bogoro','Damban','Darazo','Dass','Gamawa','Ganjuwa','Giade','Itas/Gadau',"Jama'are",'Katagum','Kirfi','Misau','Ningi','Shira','Tafawa Balewa','Toro','Warji','Zaki'],
        'Bayelsa': ['Brass','Ekeremor','Kolokuma/Opokuma','Nembe','Ogbia','Sagbama','Southern Ijaw','Yenagoa'],
        'Benue': ['Ado','Agatu','Apa','Buruku','Gboko','Guma','Gwer East','Gwer West','Katsina-Ala','Konshisha','Kwande','Logo','Makurdi','Obi','Ogbadibo','Ohimini','Oju','Okpokwu','Otukpo','Tarka','Ukum','Ushongo','Vandeikya'],
        'Borno': ['Abadam','Askira/Uba','Bama','Bayo','Biu','Chibok','Damboa','Dikwa','Gubio','Guzamala','Gwoza','Hawul','Jere','Kaga','Kala/Balge','Konduga','Kukawa','Kwaya Kusar','Mafa','Magumeri','Maiduguri','Marte','Mobbar','Monguno','Ngala','Nganzai','Shani'],
        'Cross River': ['Abi','Akamkpa','Akpabuyo','Bakassi','Bekwarra','Biase','Boki','Calabar Municipal','Calabar South','Etung','Ikom','Obanliku','Obubra','Obudu','Odukpani','Ogoja','Yakuur','Yala'],
        'Delta': ['Aniocha North','Aniocha South','Bomadi','Burutu','Ethiope East','Ethiope West','Ika North East','Ika South','Isoko North','Isoko South','Ndokwa East','Ndokwa West','Okpe','Oshimili North','Oshimili South','Patani','Sapele','Udu','Ughelli North','Ughelli South','Ukwuani','Uvwie','Warri North','Warri South','Warri South West'],
        'Ebonyi': ['Abakaliki','Afikpo North','Afikpo South','Ebonyi','Ezza North','Ezza South','Ikwo','Ishielu','Ivo','Izzi','Ohaozara','Ohaukwu','Onicha'],
        'Edo': ['Akoko-Edo','Egor','Esan Central','Esan North-East','Esan South-East','Esan West','Etsako Central','Etsako East','Etsako West','Igueben','Ikpoba-Okha','Orhionmwon','Oredo','Ovia North-East','Ovia South-West','Owan East','Owan West','Uhunmwonde'],
        'Ekiti': ['Ado Ekiti','Efon','Ekiti East','Ekiti South-West','Ekiti West','Emure','Gbonyin','Ido Osi','Ijero','Ikere','Ikole','Ilejemeje','Irepodun/Ifelodun','Ise/Orun','Moba','Oye'],
        'Enugu': ['Aninri','Awgu','Enugu East','Enugu North','Enugu South','Ezeagu','Igbo Etiti','Igbo Eze North','Igbo Eze South','Isi Uzo','Nkanu East','Nkanu West','Nsukka','Oji River','Udenu','Udi','Uzo Uwani'],
        'Gombe': ['Akko','Balanga','Billiri','Dukku','Funakaye','Gombe','Kaltungo','Kwami','Nafada','Shongom','Yamaltu/Deba'],
        'Imo': ['Aboh Mbaise','Ahiazu Mbaise','Ehime Mbano','Ezinihitte','Ideato North','Ideato South','Ihitte/Uboma','Ikeduru','Isiala Mbano','Isu','Mbaitoli','Ngor Okpala','Njaba','Nkwerre','Nwangele','Obowo','Oguta','Ohaji/Egbema','Okigwe','Orlu','Orsu','Oru East','Oru West','Owerri Municipal','Owerri North','Owerri West','Unuimo'],
        'Jigawa': ['Auyo','Babura','Biriniwa','Birnin Kudu','Buji','Dutse','Gagarawa','Garki','Gumel','Guri','Gwaram','Gwiwa','Hadejia','Jahun','Kafin Hausa','Kaugama','Kazaure','Kiri Kasama','Kiyawa','Maigatari','Malam Madori','Miga','Ringim','Roni','Sule Tankarkar','Taura','Yankwashi'],
        'Kaduna': ['Birnin Gwari','Chikun','Giwa','Igabi','Ikara','Jaba',"Jema'a",'Kachia','Kaduna North','Kaduna South','Kagarko','Kajuru','Kaura','Kauru','Kubau','Kudan','Lere','Makarfi','Sabon Gari','Sanga','Soba','Zangon Kataf','Zaria'],
        'Kano': ['Ajingi','Albasu','Bagwai','Bebeji','Bichi','Bunkure','Dala','Dambatta','Dawakin Kudu','Dawakin Tofa','Doguwa','Fagge','Gabasawa','Garko','Garun Mallam','Gaya','Gezawa','Gwale','Gwarzo','Kabo','Kano Municipal','Karaye','Kibiya','Kiru','Kumbotso','Kunchi','Kura','Madobi','Makoda','Minjibir','Nasarawa','Rano','Rimin Gado','Rogo','Shanono','Sumaila','Takai','Tarauni','Tofa','Tsanyawa','Tudun Wada','Ungogo','Warawa','Wudil'],
        'Katsina': ['Bakori','Batagarawa','Batsari','Baure','Bindawa','Charanchi','Dan Musa','Dandume','Danja','Daura','Dutsi','Dutsin-Ma','Faskari','Funtua','Ingawa','Jibia','Kafur','Kaita','Kankara','Kankia','Katsina','Kurfi','Kusada',"Mai'Adua",'Malumfashi','Mani','Mashi','Matazu','Musawa','Rimi','Sabuwa','Safana','Sandamu','Zango'],
        'Kebbi': ['Aleiro','Arewa Dandi','Argungu','Augie','Bagudo','Birnin Kebbi','Bunza','Dandi','Fakai','Gwandu','Jega','Kalgo','Koko/Besse','Maiyama','Ngaski','Sakaba','Shanga','Suru','Wasagu/Danko','Yauri','Zuru'],
        'Kogi': ['Adavi','Ajaokuta','Ankpa','Bassa','Dekina','Ibaji','Idah','Igalamela Odolu','Ijumu','Kabba/Bunu','Kogi','Lokoja','Mopa Muro','Ofu','Ogori/Magongo','Okehi','Okene','Olamaboro','Omala','Yagba East','Yagba West'],
        'Kwara': ['Asa','Baruten','Edu','Ekiti','Ifelodun','Ilorin East','Ilorin South','Ilorin West','Irepodun','Isin','Kaiama','Moro','Offa','Oke Ero','Oyun','Pategi'],
        'Lagos': ['Agege','Ajeromi-Ifelodun','Alimosho','Amuwo-Odofin','Apapa','Badagry','Epe','Eti Osa','Ibeju-Lekki','Ifako-Ijaiye','Ikeja','Ikorodu','Kosofe','Lagos Island','Lagos Mainland','Mushin','Ojo','Oshodi-Isolo','Shomolu','Surulere'],
        'Nasarawa': ['Akwanga','Awe','Doma','Karu','Keana','Keffi','Kokona','Lafia','Nasarawa','Nasarawa Egon','Obi','Toto','Wamba'],
        'Niger': ['Agaie','Agwara','Bida','Borgu','Bosso','Chanchaga','Edati','Gbako','Gurara','Katcha','Kontagora','Lapai','Lavun','Magama','Mariga','Mashegu','Mokwa','Moya','Paikoro','Rafi','Rijau','Shiroro','Suleja','Tafa','Wushishi'],
        'Ogun': ['Abeokuta North','Abeokuta South','Ado-Odo/Ota','Egbado North','Egbado South','Ewekoro','Ifo','Ijebu East','Ijebu North','Ijebu North East','Ijebu Ode','Ikenne','Imeko Afon','Ipokia','Obafemi Owode','Odeda','Odogbolu','Ogun Waterside','Remo North','Shagamu'],
        'Ondo': ['Akoko North-East','Akoko North-West','Akoko South-West','Akoko South-East','Akure North','Akure South','Ese Odo','Idanre','Ifedore','Ilaje','Ile Oluji/Okeigbo','Irele','Odigbo','Okitipupa','Ondo East','Ondo West','Ose','Owo'],
        'Osun': ['Atakunmosa East','Atakunmosa West','Aiyedaade','Aiyedire','Boluwaduro','Boripe','Ede North','Ede South','Egbedore','Ejigbo','Ife Central','Ife East','Ife North','Ife South','Ifedayo','Ifelodun','Ila','Ilesa East','Ilesa West','Irepodun','Irewole','Isokan','Iwo','Obokun','Odo Otin','Ola Oluwa','Olorunda','Oriade','Orolu','Osogbo'],
        'Oyo': ['Afijio','Akinyele','Atiba','Atisbo','Egbeda','Ibadan North','Ibadan North-East','Ibadan North-West','Ibadan South-East','Ibadan South-West','Ibarapa Central','Ibarapa East','Ibarapa North','Ido','Irepo','Iseyin','Itesiwaju','Iwajowa','Kajola','Lagelu','Ogbomosho North','Ogbomosho South','Ogo Oluwa','Olorunsogo','Oluyole','Ona Ara','Orelope','Ori Ire','Oyo East','Oyo West','Saki East','Saki West','Surulere'],
        'Plateau': ['Barkin Ladi','Bassa','Bokkos','Jos East','Jos North','Jos South','Kanam','Kanke','Langtang North','Langtang South','Mangu','Mikang','Pankshin',"Qua'an Pan",'Riyom','Shendam','Wase'],
        'Rivers': ['Abua/Odual','Ahoada East','Ahoada West','Akuku-Toru','Andoni','Asari-Toru','Bonny','Degema','Emuoha','Eleme','Etche','Gokana','Ikwerre','Khana','Obio/Akpor','Ogba/Egbema/Ndoni','Ogu/Bolo','Okrika','Omuma','Opobo/Nkoro','Oyigbo','Port Harcourt','Tai'],
        'Sokoto': ['Binji','Bodinga','Dange Shuni','Gada','Goronyo','Gudu','Gwadabawa','Illela','Isa','Kebbe','Kware','Rabah','Sabon Birni','Shagari','Silame','Sokoto North','Sokoto South','Tambuwal','Tangaza','Tureta','Wamako','Wurno','Yabo'],
        'Taraba': ['Ardo Kola','Bali','Donga','Gashaka','Gassol','Ibi','Jalingo','Karim Lamido','Kurmi','Lau','Sardauna','Takum','Ussa','Wukari','Yorro','Zing'],
        'Yobe': ['Bade','Bursari','Damaturu','Fika','Fune','Geidam','Gujba','Gulani','Jakusko','Karasuwa','Machina','Nangere','Nguru','Potiskum','Tarmuwa','Yunusari','Yusufari'],
        'Zamfara': ['Anka','Bakura','Birnin Magaji/Kiyaw','Bukkuyum','Bungudu','Gummi','Gusau','Kaura Namoda','Maradun','Maru','Shinkafi','Talata Mafara','Tsafe','Zurmi'],
        'FCT (Abuja)': ['Abaji','Abuja Municipal','Bwari','Gwagwalada','Kuje','Kwali']
    };
    window._NIGERIA_STATES_LGAS = NIGERIA_STATES_LGAS;

    /* =========================================================================
       §NIGERIA STATE REGIONS  Broader, informal in-state groupings (city /
       axis level — e.g. Lagos → Lagos Island / Lekki-Ajah / Ikeja-GRA),
       used ONLY for the Vehicles & Trucks category's Location dropdown.
       FIX (request — "remove local government and replace with regions in
       the vehicle and truck section only"): every other category keeps
       the existing State → Local Government Area cascade
       (NIGERIA_STATES_LGAS) completely unchanged — see
       _mktInitLocationCascade below for the category-aware switch between
       the two lists. */
    var NIGERIA_STATE_REGIONS = {
        'Abia': ['Aba Metropolis', 'Umuahia Metropolis', 'Ohafia / Arochukwu Axis', 'Isiala Ngwa Axis'],
        'Adamawa': ['Yola Metropolis', 'Mubi Axis', 'Numan Axis', 'Ganye Axis'],
        'Akwa Ibom': ['Uyo Metropolis', 'Eket Axis', 'Ikot Ekpene Axis', 'Oron Axis'],
        'Anambra': ['Awka Metropolis', 'Onitsha Metropolis', 'Nnewi Axis', 'Aguata Axis'],
        'Bauchi': ['Bauchi Metropolis', 'Azare Axis', 'Misau Axis', 'Toro Axis'],
        'Bayelsa': ['Yenagoa Metropolis', 'Brass / Ogbia Axis (Riverine)', 'Sagbama / Ekeremor Axis'],
        'Benue': ['Makurdi Metropolis', 'Gboko Axis', 'Otukpo Axis', 'Katsina-Ala Axis'],
        'Borno': ['Maiduguri Metropolis', 'Biu Axis', 'Bama Axis'],
        'Cross River': ['Calabar Metropolis', 'Ikom Axis', 'Ogoja Axis', 'Obudu Axis'],
        'Delta': ['Warri / Effurun', 'Asaba / Oshimili Axis', 'Sapele / Ethiope Axis', 'Ughelli Axis', 'Agbor / Ika Axis'],
        'Ebonyi': ['Abakaliki Metropolis', 'Afikpo Axis', 'Onueke / Ezza Axis'],
        'Edo': ['Benin City (GRA)', 'Benin City (Central)', 'Auchi / Etsako Axis', 'Ekpoma / Esan Axis'],
        'Ekiti': ['Ado Ekiti Metropolis', 'Ikere Axis', 'Ikole / Oye Axis'],
        'Enugu': ['Enugu City (GRA / Independence Layout)', 'Enugu North', 'Enugu South', 'Nsukka Axis'],
        'Gombe': ['Gombe Metropolis', 'Kaltungo Axis', 'Billiri Axis'],
        'Imo': ['Owerri Metropolis', 'Orlu Axis', 'Okigwe Axis', 'Mbaise Axis'],
        'Jigawa': ['Dutse Metropolis', 'Hadejia Axis', 'Gumel Axis', 'Kazaure Axis'],
        'Kaduna': ['Kaduna North', 'Kaduna South', 'Zaria', 'Kafanchan / Southern Kaduna'],
        'Kano': ['Kano Municipal (Old City)', 'Sabon Gari', 'Nassarawa GRA', 'Kano North Axis', 'Kano South Axis'],
        'Katsina': ['Katsina Metropolis', 'Funtua Axis', 'Daura Axis', 'Malumfashi Axis'],
        'Kebbi': ['Birnin Kebbi Metropolis', 'Argungu Axis', 'Yauri Axis', 'Zuru Axis'],
        'Kogi': ['Lokoja Metropolis', 'Okene Axis', 'Idah / Ibaji Axis', 'Kabba Axis'],
        'Kwara': ['Ilorin Metropolis', 'Offa Axis', 'Omu-Aran Axis', 'Patigi / Baruten Axis'],
        'Lagos': ['Lagos Island', 'Lagos Mainland', 'Lekki / Ajah', 'Ikeja / GRA', 'Ikorodu', 'Badagry', 'Epe', 'Agege / Ogba'],
        'Nasarawa': ['Lafia Metropolis', 'Keffi / Akwanga Axis', 'Nasarawa Axis'],
        'Niger': ['Minna Metropolis', 'Bida Axis', 'Suleja / Tafa Axis', 'Kontagora Axis'],
        'Ogun': ['Abeokuta Metropolis', 'Ijebu Ode Axis', 'Sagamu / Remo Axis', 'Ota / Sango Axis'],
        'Ondo': ['Akure Metropolis', 'Ondo Town Axis', 'Owo Axis', 'Okitipupa / Ilaje Axis'],
        'Osun': ['Osogbo Metropolis', 'Ile-Ife Axis', 'Ilesa Axis', 'Iwo Axis'],
        'Oyo': ['Ibadan North (Bodija / UI)', 'Ibadan South (Ring Road / Challenge)', 'Ibadan Central (Dugbe)', 'Ogbomosho Axis', 'Oyo Town Axis', 'Iseyin / Saki Axis'],
        'Plateau': ['Jos Metropolis', 'Bukuru Axis', 'Pankshin Axis', 'Shendam Axis'],
        'Rivers': ['Port Harcourt Central', 'GRA Port Harcourt', 'Trans-Amadi', 'Obio-Akpor', 'Eleme Axis', 'Bonny / Degema Axis (Riverine)'],
        'Sokoto': ['Sokoto Metropolis', 'Wurno Axis', 'Illela Axis', 'Tambuwal Axis'],
        'Taraba': ['Jalingo Metropolis', 'Wukari Axis', 'Bali Axis', 'Takum Axis'],
        'Yobe': ['Damaturu Metropolis', 'Potiskum Axis', 'Nguru Axis', 'Gashua / Bade Axis'],
        'Zamfara': ['Gusau Metropolis', 'Kaura Namoda Axis', 'Talata Mafara Axis', 'Anka Axis'],
        'FCT (Abuja)': ['Abuja Central (Garki / Wuse)', 'Maitama / Asokoro', 'Gwarinpa / Life Camp', 'Kubwa', 'Lugbe / Airport Road', 'Gwagwalada', 'Bwari', 'Kuje']
    };
    window._NIGERIA_STATE_REGIONS = NIGERIA_STATE_REGIONS;

    /* Sentinel value for the region dropdown's "Other" option — request
       "expand the list of regions or add an 'Other' option with a field
       for users to enter their region if it is not included in the
       list". Rather than trying to guess every axis/neighbourhood a
       seller might mean for all 37 states (the actual gap the region
       list can't ever fully close), this adds a catch-all: picking
       "Other" reveals a free-text field (#mkt-loc-region-other) whose
       value is used in place of the dropdown's when building the saved
       location string. */
    var MKT_REGION_OTHER_VALUE = '__other__';

    function _mktInitLocationCascade(catKey) {
        var stateSel = document.getElementById('mkt-loc-state');
        var lgaSel   = document.getElementById('mkt-loc-lga');
        var townInp  = document.getElementById('mkt-loc-town');
        var otherInp = document.getElementById('mkt-loc-region-other');
        var hidden   = document.getElementById('item-location');
        if (!stateSel || !lgaSel || !hidden) return;

        /* FIX (request — "remove local government and replace with
           regions in the vehicle and truck section only"): the second
           dropdown switches to NIGERIA_STATE_REGIONS (broader, informal
           in-state areas) whenever the category currently open in the
           Sell flow is Vehicles & Trucks (MKT_CATEGORY_SCHEMA_MAP[catKey]
           === 'vehicles' — the same top-level category, covering Cars /
           Passenger Buses / Trucks & Trailers, that the "hide Sales Type"
           fix above already scopes to). Every other category keeps
           NIGERIA_STATES_LGAS untouched. Stored on the element (not a
           closure variable) so the 'change' listener wired once below —
           and any re-entrant call to this function from switching
           category via the Sell flow's Back button — always reads the
           mode that's current right now, not whatever it was the moment
           the listener was first attached. */
        var isVehicleCat = MKT_CATEGORY_SCHEMA_MAP[catKey] === 'vehicles';
        lgaSel.dataset.mktLocMode = isVehicleCat ? 'region' : 'lga';

        if (!stateSel._built) {
            stateSel._built = true;
            Object.keys(NIGERIA_STATES_LGAS).sort().forEach(function (state) {
                var opt = document.createElement('option');
                opt.value = state; opt.textContent = state;
                stateSel.appendChild(opt);
            });
        }

        function syncHidden() {
            var lgaValue = lgaSel.value === MKT_REGION_OTHER_VALUE
                ? (otherInp && otherInp.value.trim() ? otherInp.value.trim() : '')
                : lgaSel.value;
            var parts = [townInp && townInp.value.trim() ? townInp.value.trim() : '', lgaValue, stateSel.value].filter(Boolean);
            hidden.value = parts.join(', ');
        }

        function _populateSecondary() {
            var mode = lgaSel.dataset.mktLocMode === 'region' ? 'region' : 'lga';
            var placeholder = mode === 'region' ? 'Region…' : 'Local Government Area…';
            lgaSel.innerHTML = '<option value="">' + placeholder + '</option>';
            var list = (mode === 'region' ? NIGERIA_STATE_REGIONS : NIGERIA_STATES_LGAS)[stateSel.value] || [];
            lgaSel.disabled = !list.length;
            list.forEach(function (item) {
                var opt = document.createElement('option');
                opt.value = item; opt.textContent = item;
                lgaSel.appendChild(opt);
            });
            /* "Other" is only offered in region mode (Vehicles & Trucks) —
               the LGA list is already exhaustive/official, so a free-text
               escape hatch isn't needed there the way it is for the more
               informal, inherently-incomplete region groupings. */
            if (mode === 'region' && list.length) {
                var otherOpt = document.createElement('option');
                otherOpt.value = MKT_REGION_OTHER_VALUE;
                otherOpt.textContent = 'Other (type your region)';
                lgaSel.appendChild(otherOpt);
            }
            if (otherInp) { otherInp.style.display = 'none'; otherInp.value = ''; }
        }

        /* Re-sync immediately if the mode changed since the last render
           (e.g. category switched via Back, with a State already picked)
           — don't wait for a fresh 'change' event on the State select.
           Guarded so re-running this whole function for the SAME mode
           (re-opening the same category) never wipes an already-correct,
           already-chosen selection. */
        if (lgaSel.dataset.mktLocModeRendered !== lgaSel.dataset.mktLocMode) {
            lgaSel.dataset.mktLocModeRendered = lgaSel.dataset.mktLocMode;
            _populateSecondary();
            syncHidden();
        }

        if (!stateSel._wired) {
            stateSel._wired = true;
            stateSel.addEventListener('change', function () {
                _populateSecondary();
                syncHidden();
            });
            lgaSel.addEventListener('change', function () {
                if (otherInp) {
                    var showOther = lgaSel.value === MKT_REGION_OTHER_VALUE;
                    otherInp.style.display = showOther ? '' : 'none';
                    if (showOther) otherInp.focus();
                    else otherInp.value = '';
                }
                syncHidden();
            });
            if (townInp) townInp.addEventListener('input', syncHidden);
            if (otherInp) otherInp.addEventListener('input', syncHidden);
        }
    }
    window._mktInitLocationCascade = _mktInitLocationCascade;

    /* =========================================================================
       §CATEGORY-SPECIFIC FIELD SCHEMAS  Each schema is a list of field
       descriptors rendered into #mkt-dynamic-fields by _mktRenderDynamicFields().
       Field types: 'text' | 'number' | 'select' | 'vehicle-model' | 'multiselect'.
       ========================================================================= */
    var VEHICLE_BRANDS = ['Toyota','Honda','Ford','Lexus','Mercedes-Benz','BMW','Hyundai','Kia','Nissan','Mazda','Volkswagen','Peugeot','Mitsubishi','Land Rover','Jeep','Chevrolet','Volvo','Audi','Infiniti','Acura','Suzuki','Mini','Porsche','Jaguar','Tata','Other'];
    var VEHICLE_MODELS_BY_BRAND = {
        'Toyota': ['Corolla','Camry','Avalon','Venza','Highlander','RAV4','Hilux','Sienna','Land Cruiser','Prado','Yaris'],
        'Honda': ['Civic','Accord','CR-V','Pilot','Odyssey','HR-V'],
        'Ford': ['Focus','Fusion','Explorer','Edge','F-150','Escape','Ranger'],
        'Lexus': ['ES','IS','RX','GX','LX','NX'],
        'Mercedes-Benz': ['C-Class','E-Class','S-Class','GLE','GLC','ML','G-Wagon'],
        'BMW': ['3 Series','5 Series','7 Series','X3','X5','X6'],
        'Hyundai': ['Elantra','Sonata','Tucson','Santa Fe','Accent'],
        'Kia': ['Rio','Optima','Sportage','Sorento','Cerato'],
        'Nissan': ['Altima','Sentra','Maxima','Murano','Pathfinder','Rogue'],
        'Mazda': ['3','6','CX-5','CX-9'],
        'Volkswagen': ['Golf','Passat','Jetta','Tiguan'],
        'Peugeot': ['307','407','508','3008','5008'],
        'Mitsubishi': ['Lancer','Outlander','Pajero','ASX'],
        'Land Rover': ['Range Rover','Range Rover Sport','Range Rover Evoque','Discovery','Defender'],
        'Jeep': ['Grand Cherokee','Cherokee','Wrangler','Compass'],
        'Chevrolet': ['Malibu','Cruze','Camaro','Tahoe'],
        'Volvo': ['S60','S90','XC60','XC90'],
        'Audi': ['A4','A6','Q5','Q7'],
        'Infiniti': ['G37','Q50','QX60','QX80'],
        'Acura': ['TL','MDX','RDX'],
        'Suzuki': ['Swift','Vitara','Jimny'],
        'Mini': ['Cooper','Countryman'],
        'Porsche': ['Cayenne','Macan','911','Panamera'],
        'Jaguar': ['XF','XE','F-Pace'],
        'Tata': ['Indica','Indigo']
    };
    function _mktYearOptions() {
        var out = [];
        for (var y = 2026; y >= 2000; y--) out.push(String(y));
        return out;
    }
    /* FIX (request — vehicle Condition options): replaces the previous
       generic New/Used/Fairly Used set for Vehicles only (every other
       category's own condition options — properties, gadgets, general,
       others — are untouched). "Local Used" reveals a second, dependent
       dropdown (VEHICLE_CONDITION_SUB_OPTIONS via the 'conditionSub'
       field above) for Registered/Not Registered status.
       FIX (request — "registered column should have sub column Yes and
       No"): the Registration Status sub-dropdown previously repeated
       "Used - ..." (redundant once it's already nested under Condition =
       Local Used) — simplified to a plain Yes/No answer to "Registered?".
       Only the option labels changed; the field itself (key, label,
       dependsOn) is untouched, so this doesn't affect the generic
       show/hide/reset wiring in _mktRenderDynamicFields. */
    var VEHICLE_CONDITION_OPTIONS = ['Brand New', 'Foreign Used', 'Local Used'];
    var VEHICLE_CONDITION_SUB_OPTIONS = ['Yes', 'No'];
    var VEHICLE_FEATURE_GROUPS = [
        { title: 'Comfort & Convenience', items: ['Air Conditioning','Armrests','Cup Holders','Leather Seats','Electric Windows','Electric Mirrors','Cruise Control','Keyless Entry','Push Start Button','Remote Boot Release','Rear AC Vents'] },
        { title: 'Safety & Driver Assist', items: ['Airbags','Automatic Wipers','Anti-Lock Brakes','Blind Spot Monitor','Parking Sensors','Parking Assist'] }
    ];
    var PROPERTY_AMENITY_GROUPS = [
        { title: '', items: ['Parking','Water','Electricity','Security','Furnished','Swimming Pool','Gym','Balcony'] }
    ];

    var MKT_CATEGORY_FIELD_SCHEMAS = {
        /* FIX (request — Vehicle & Truck section adjustments, 2026-08-09):
           - Model: was a dependent 'vehicle-model' select driven off Brand
             (VEHICLE_MODELS_BY_BRAND) — now a plain free-text field so a
             seller can type any model, not just ones on our hardcoded list.
           - Brand: was a 'select' limited to VEHICLE_BRANDS — now a plain
             free-text field, no predefined brand list dependency.
           - Engine Type: removed entirely (field deleted from the schema,
             so it's no longer rendered, collected, or stored on new
             listings — see _mktRenderDynamicFields' now-dead brand→model
             listener below, also removed since Model is no longer
             brand-dependent).
           - Color: removed entirely (field deleted from the schema).
           VEHICLE_BRANDS / VEHICLE_MODELS_BY_BRAND above are left in place
           (no-deletion convention) but are now unused by this schema. */
        vehicles: [
            { key: 'year', label: 'Year', type: 'select', options: _mktYearOptions() },
            { key: 'brand', label: 'Make / Brand', type: 'text', placeholder: 'e.g., Toyota' },
            { key: 'model', label: 'Model', type: 'text', placeholder: 'e.g., Corolla' },
            /* FIX (2026-08-09 — Marketplace Adjustments #10): "Remove the
               type column dropdown and replace with typing." Was a fixed
               'select' with a 7-option list (Sedan/SUV/Truck/Van/Coupe/
               Bus/Motorbike) — sellers with a body style outside that
               list had no correct option to pick. Free-text now, same as
               Brand/Model right above/below it. */
            { key: 'vtype', label: 'Type', type: 'text', placeholder: 'e.g., SUV, Sedan, Pickup…' },
            { key: 'transmission', label: 'Transmission', type: 'select', options: ['Automatic','Manual'] },
            /* FIX (request — "Mileage field: make mileage optional instead
               of mandatory"): this field was never actually enforced as
               required anywhere in the submit handler (only Name/Price/
               Location are — see app-fixes.js's 'marketplace-form' case),
               so nothing needed to change functionally. Label now says so
               explicitly, matching the "(optional)" convention already
               used on the `others` schema's condition field below, so it
               no longer *reads* as mandatory to the seller either. */
            { key: 'mileage', label: 'Mileage (km) (optional)', type: 'number', placeholder: 'e.g., 45000' },
            /* FIX (request — vehicle Condition should read "Brand New /
               Foreign Used / Local Used", with Local Used offering a
               registered/unregistered sub-choice): VEHICLE_CONDITION_SUB
               below drives that nested dropdown — see
               _mktFieldHTML/_mktRenderDynamicFields for how the
               'conditionSub' field is shown/hidden and reset as the
               Condition value changes. Kept as its own field (not folded
               into the option string) so it's stored as its own
               categoryFields.conditionSub value on the listing. */
            { key: 'condition', label: 'Condition', type: 'select', options: VEHICLE_CONDITION_OPTIONS },
            { key: 'conditionSub', label: 'Registration Status', type: 'select', options: VEHICLE_CONDITION_SUB_OPTIONS, dependsOn: { key: 'condition', value: 'Local Used' } },
            { key: 'features', label: 'Select Features', type: 'multiselect', groups: VEHICLE_FEATURE_GROUPS }
        ],
        properties: [
            { key: 'ptype', label: 'Property Type', type: 'select', options: ['Apartment','House','Land','Office','Warehouse','Other'] },
            { key: 'purpose', label: 'Sale or Rent', type: 'select', options: ['For Sale','For Rent'] },
            { key: 'size', label: 'Size / Area (sqm, acres, or plots)', type: 'text', placeholder: 'e.g., 450 sqm' },
            { key: 'condition', label: 'Condition', type: 'select', options: ['New','Renovated','Under Construction'] },
            { key: 'ownership', label: 'Ownership Type', type: 'select', options: ['Freehold','Leasehold','Rental'] },
            { key: 'bedrooms', label: 'Bedrooms', type: 'select', options: ['Studio','1','2','3','4','5','6+'] },
            { key: 'bathrooms', label: 'Bathrooms', type: 'select', options: ['1','2','3','4','5+'] },
            { key: 'amenities', label: 'Amenities', type: 'multiselect', groups: PROPERTY_AMENITY_GROUPS }
        ],
        gadgets: [
            { key: 'itemType', label: 'Item Type', type: 'select', options: ['Appliance','Generator','Tool','Solar Panel','Laptop','Camera','Audio / Speaker','Wearable','Other'] },
            { key: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g., Samsung' },
            { key: 'model', label: 'Model', type: 'text', placeholder: 'e.g., Galaxy S21' },
            { key: 'specs', label: 'Specifications (power / voltage / capacity)', type: 'text', placeholder: 'e.g., 3.5KVA, 220V' },
            { key: 'condition', label: 'Condition', type: 'select', options: ['New','Used','Refurbished'] },
            { key: 'warranty', label: 'Warranty', type: 'select', options: ['No Warranty','Yes — 3 months','Yes — 6 months','Yes — 1 year','Yes — 2+ years'] }
        ],
        others: [
            { key: 'condition', label: 'Condition (optional)', type: 'select', options: ['New','Used','Fairly Used'] }
        ],
        services: [
            { key: 'serviceType', label: 'Service / Role Type', type: 'text', placeholder: 'e.g., Plumbing, Software Engineer' },
            { key: 'experience', label: 'Experience Level', type: 'select', options: ['Entry Level','Intermediate','Experienced','Expert'] }
        ],
        /* FIX (request — "for job-related entries, the employer should be
           added immediately after the job category enclosed in brackets"):
           Jobs (vacancy postings) previously shared the generic "services"
           schema with Job Seeking/Professional Services/Repair — none of
           which have an employer to name. Jobs now gets its own schema so
           a poster can explicitly name the hiring company; every other
           service category is untouched. serviceType/experience keep the
           same field keys as "services" on purpose (not renamed) so the
           existing quick-specs/badge/MKT_SPEC_LABELS plumbing that already
           reads those keys keeps working without any other change —
           serviceType is simply relabeled here to read as a job title
           ("Position") instead of a generic role type. */
        jobsSchema: [
            { key: 'company', label: 'Company / Employer Name', type: 'text', placeholder: 'e.g., Acme Nigeria Ltd' },
            { key: 'serviceType', label: 'Job Title / Position', type: 'text', placeholder: 'e.g., Front Desk Officer' },
            { key: 'experience', label: 'Experience Level', type: 'select', options: ['Entry Level','Intermediate','Experienced','Expert'] }
        ],
        general: [
            { key: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g., Nike' },
            { key: 'model', label: 'Model / Type', type: 'text', placeholder: 'e.g., Air Max' },
            { key: 'condition', label: 'Condition', type: 'select', options: ['New','Used','Fairly Used'] }
        ]
    };
    /* Ad Title placeholder examples, per category — used by
       _mktShowAdDetailsStep() below so a seller listing a phone, a sofa,
       or a service doesn't see a car-specific example ("2019 Toyota
       Camry") sitting in the field regardless of what they're posting. */
    var MKT_TITLE_PLACEHOLDER_MAP = {
        vehicles:     'e.g., 2019 Toyota Camry',
        properties:   'e.g., 3 Bedroom Flat, Lekki',
        phones:       'e.g., iPhone 14 Pro Max, 128GB',
        gadgets:      'e.g., HP Pavilion Laptop, 16GB RAM',
        furniture:    'e.g., 6-Seater Fabric Sofa Set',
        personalcare: 'e.g., Shea Butter Moisturizing Cream',
        clothing:     'e.g., Men\'s Leather Jacket, Size L',
        leisure:      'e.g., Yamaha Acoustic Guitar',
        babies:       'e.g., Baby Stroller, 3-in-1',
        pets:         'e.g., German Shepherd Puppy',
        food:         'e.g., 50kg Bag of Rice',
        commercial:   'e.g., Industrial Generator, 20KVA',
        repair:       'e.g., Bag of Cement, Dangote 50kg',
        professional: 'e.g., Wedding Photography Services',
        jobseeking:   'e.g., Experienced Accountant Seeking Role',
        jobs:         'e.g., Front Desk Officer Needed',
        others:       'e.g., Item Name / Title'
    };

    /* ── Ad Title hint + Description copy, tailored per category ────────────
       FIX (request — "make sure to include the make and model" and "anything
       a buyer should know" were showing on every category, including Jobs
       and Job Seeking): those two hard-coded strings lived once in the HTML
       and were never swapped out, so a Job listing carried the same
       car-shopping language as a Vehicles listing. Every top-level category
       now gets its own Ad Title hint, Description field label, and
       Description placeholder — written for what that category actually is
       (a job vacancy, a candidate profile, a service offering, a pet, a
       property, etc.) rather than one generic "item a buyer should know
       about" narrative stretched over everything. */
    var MKT_AD_COPY_MAP = {
        vehicles:     { hint: '(please make sure to include the make and model)',    descLabel: 'Description', descPh: "Describe the vehicle's condition, mileage, service history, and anything a buyer should know…" },
        properties:   { hint: '(please include the property type and location)',     descLabel: 'Description', descPh: 'Describe the property\u2019s condition, features, and anything a tenant or buyer should know…' },
        phones:       { hint: '(please include the brand and model)',               descLabel: 'Description', descPh: 'Describe the device\u2019s condition, storage capacity, included accessories, and anything a buyer should know…' },
        gadgets:      { hint: '(please include the brand and model)',               descLabel: 'Description', descPh: 'Describe the item\u2019s condition, specifications, included accessories, and anything a buyer should know…' },
        furniture:    { hint: '(please include the material and dimensions)',       descLabel: 'Description', descPh: 'Describe the item\u2019s condition, dimensions, material, and anything a buyer should know…' },
        personalcare: { hint: '(please include the brand and size/volume)',         descLabel: 'Description', descPh: 'Describe the product\u2019s condition, ingredients, expiry date, and anything a buyer should know…' },
        clothing:     { hint: '(please include the brand and size)',                descLabel: 'Description', descPh: 'Describe the item\u2019s condition, size, material, and anything a buyer should know…' },
        leisure:      { hint: '(please include the brand or type)',                 descLabel: 'Description', descPh: 'Describe the item\u2019s condition, features, and anything a buyer should know…' },
        babies:       { hint: '(please include the age range and brand)',           descLabel: 'Description', descPh: 'Describe the item\u2019s condition, suitable age range, and anything a buyer should know…' },
        pets:         { hint: '(please include the breed and age)',                 descLabel: 'Description', descPh: 'Describe the pet\u2019s breed, age, temperament, vaccination status, and anything a buyer should know…' },
        food:         { hint: '(please include the quantity and type)',             descLabel: 'Description', descPh: 'Describe the quantity, freshness or expiry date, and anything a buyer should know…' },
        commercial:   { hint: '(please include the brand and capacity)',            descLabel: 'Description', descPh: 'Describe the equipment\u2019s condition, capacity, specifications, and anything a buyer should know…' },
        repair:       { hint: '(please include the material, brand, or type of service)', descLabel: 'Service Description', descPh: 'Describe your service offering or materials, experience, coverage area, and anything a client should know…' },
        professional: { hint: '(please include the type of service you offer)',     descLabel: 'Service Description', descPh: 'Describe your service, experience, portfolio, and anything a client should know…' },
        jobseeking:   { hint: '(please include your target role)',                  descLabel: 'About You', descPh: 'Describe your skills, experience, qualifications, and the kind of role you\u2019re looking for…' },
        jobs:         { hint: '(please include the job title and role)',            descLabel: 'Job Description', descPh: 'Describe the role, responsibilities, requirements, and anything an applicant should know…' },
        others:       { hint: '(please include key details about the item)',        descLabel: 'Description', descPh: 'Describe the item\u2019s condition and anything a buyer should know…' }
    };
    /* Applies the Ad Title hint + Description label/placeholder for the
       given category, falling back to the Vehicles/generic copy already in
       the HTML if the category has no entry (shouldn't happen, but keeps
       this from ever leaving the fields blank). */
    function _mktApplyAdCopy(catKey) {
        var copy = MKT_AD_COPY_MAP[catKey] || MKT_AD_COPY_MAP.others;
        var hintEl  = document.getElementById('mkt-title-hint');
        var descLbl = document.getElementById('mkt-description-label');
        var descEl  = document.getElementById('item-description');
        if (hintEl)  hintEl.textContent = copy.hint;
        if (descLbl) descLbl.textContent = copy.descLabel;
        if (descEl)  descEl.placeholder = copy.descPh;
    }
    window._mktApplyAdCopy = _mktApplyAdCopy;

    var MKT_CATEGORY_SCHEMA_MAP = {
        vehicles: 'vehicles',
        properties: 'properties',
        gadgets: 'gadgets',
        phones: 'gadgets',
        others: 'others',
        jobseeking: 'services',
        jobs: 'jobsSchema',
        professional: 'services',
        repair: 'services'
    };
    function _mktSchemaForCategory(catKey) {
        var name = MKT_CATEGORY_SCHEMA_MAP[catKey] || 'general';
        return MKT_CATEGORY_FIELD_SCHEMAS[name] || MKT_CATEGORY_FIELD_SCHEMAS.general;
    }

    /* ── "Photos & Documents" section, tailored per category ────────────────
       FIX (request — job seekers were shown the same "upload a photo of the
       item" / "Upload Inspection Report" wording as someone selling a car):
       photo/video upload and the "Inspection Report" upload only make sense
       for a physical item you can photograph or have inspected — they don't
       fit a Job, Job Seeking, Professional Services, or Repair & Construction
       listing. For those four categories: the photo/video upload is hidden
       entirely (it's strictly for goods & products), and the document upload
       is relabeled in plain language for what someone would actually attach
       there — a passport photograph, CV/résumé, certificates, or
       professional credentials. Every other (product) category is
       unaffected and keeps the normal photo/video + inspection-report
       upload. */
    var MKT_MEDIA_DOCS_DEFAULT = {
        sectionTitle: 'Photos & Documents',
        mediaLabel:   'Add photos or a video (up to 15 photos, 1 video)',
        docLabel:     'Upload Inspection Report (Optional)',
        docBtnText:   'Select Report Files'
    };
    var MKT_MEDIA_DOCS_SERVICE = {
        jobs:         { docLabel: 'Upload documents (optional) — e.g. company profile, job details' },
        jobseeking:   { docLabel: 'Upload your documents (optional) — e.g. passport photo, CV/Resume, certificates' },
        professional: { docLabel: 'Upload documents (optional) — e.g. certificates, credentials, or portfolio' },
        repair:       { docLabel: 'Upload documents (optional) — e.g. certificates, credentials, or portfolio' }
    };
    function _mktApplyMediaDocsCopy(catKey) {
        var isService  = !!MKT_MEDIA_DOCS_SERVICE[catKey];
        /* FIX (request — Vehicle & Truck section adjustments, 2026-08-09):
           "Remove upload inspection report" for Vehicles & Trucks only.
           This upload group (#mkt-doc-group / #inspection-report-files) is
           shared across every category — Jobs/Job Seeking/Professional/
           Repair reuse it (relabeled) for CVs/certificates, see
           MKT_MEDIA_DOCS_SERVICE above — so it isn't deleted from the DOM,
           just hidden specifically for `vehicles`, the same way it's
           already hidden for the service categories via mediaGroup above. */
        var isVehicleCat = catKey === 'vehicles';
        var sectionEl  = document.getElementById('mkt-photos-section-title');
        var mediaGroup = document.getElementById('mkt-media-group');
        var mediaLabel = document.getElementById('mkt-media-label');
        var docGroup   = document.getElementById('mkt-doc-group');
        var docLabel   = document.getElementById('mkt-doc-label');
        var docBtnText = document.getElementById('mkt-doc-btn-text');

        if (sectionEl) sectionEl.textContent = isService ? 'Documents' : (isVehicleCat ? 'Photos' : MKT_MEDIA_DOCS_DEFAULT.sectionTitle);
        // Photo/video upload is only for goods & products — hidden for Jobs,
        // Job Seeking, Professional Services and Repair & Construction.
        if (mediaGroup) mediaGroup.style.display = isService ? 'none' : '';
        if (mediaLabel) mediaLabel.textContent = MKT_MEDIA_DOCS_DEFAULT.mediaLabel;
        if (docGroup) docGroup.style.display = isVehicleCat ? 'none' : '';
        if (docLabel) docLabel.textContent = isService ? MKT_MEDIA_DOCS_SERVICE[catKey].docLabel : MKT_MEDIA_DOCS_DEFAULT.docLabel;
        if (docBtnText) docBtnText.textContent = isService ? 'Select Files' : MKT_MEDIA_DOCS_DEFAULT.docBtnText;
    }
    window._mktApplyMediaDocsCopy = _mktApplyMediaDocsCopy;

    /* ── Contact-info / pricing field copy, tailored per category ───────────
       FIX (request — job & service listings shouldn't say "for buyers" /
       "Pickup Location"): the Contact Info block under the Sell form was a
       single hard-coded set of labels ("Your Full Name (for buyers)",
       "Your Address / Pickup Location", plain "Price") reused verbatim for
       every category, including Jobs, Job Seeking, Professional Services
       and Repair & Construction — categories where nobody is buying a
       physical item, so "buyer" and "pickup" never made sense. Each of
       those four now gets its own audience-appropriate copy; every other
       (product) category keeps the original buyer/pickup/price wording via
       MKT_DEFAULT_CONTACT_LABELS below. */
    var MKT_DEFAULT_CONTACT_LABELS = {
        title:    'Contact Info for Direct Sale (Optional)',
        name:     'Your Full Name (for buyers)',
        namePh:   'e.g., John Doe',
        phone:    'Your Phone Number (for buyers)',
        phonePh:  'e.g., +2348012345678',
        email:    'Your Contact Email (for buyers)',
        emailPh:  'e.g., contact@email.com',
        address:  'Your Address / Pickup Location',
        addressPh:'e.g., 123 Allen Avenue, Ikeja, Lagos',
        price:    'Price',
        pricePh:  'e.g., 250000'
    };
    var MKT_SERVICE_CONTACT_LABELS = {
        jobs: {
            title:    'Employer Contact Info (Optional)',
            name:     'Your Full Name (for applicants)',
            namePh:   'e.g., John Doe',
            phone:    'Your Phone Number (for applicants)',
            phonePh:  'e.g., +2348012345678',
            email:    'Your Contact Email (for applicants)',
            emailPh:  'e.g., careers@company.com',
            address:  'Office / Interview Location',
            addressPh:'e.g., 12 Marina Road, Lagos Island, Lagos',
            price:    'Salary / Pay Rate',
            pricePh:  'e.g., 150000/month'
        },
        jobseeking: {
            title:    'Your Contact Info (Optional)',
            name:     'Your Full Name (for employers)',
            namePh:   'e.g., John Doe',
            phone:    'Your Phone Number (for employers)',
            phonePh:  'e.g., +2348012345678',
            email:    'Your Contact Email (for employers)',
            emailPh:  'e.g., contact@email.com',
            address:  'Your Location / Preferred Work Area',
            addressPh:'e.g., Ikeja, Lagos (open to remote)',
            price:    'Expected Salary / Rate',
            pricePh:  'e.g., 150000/month'
        },
        professional: {
            title:    'Service Provider Contact Info (Optional)',
            name:     'Your Full Name (for clients)',
            namePh:   'e.g., John Doe',
            phone:    'Your Phone Number (for clients)',
            phonePh:  'e.g., +2348012345678',
            email:    'Your Contact Email (for clients)',
            emailPh:  'e.g., contact@email.com',
            address:  'Your Location / Service Area',
            addressPh:'e.g., Lekki & Island-wide, Lagos',
            price:    'Rate / Starting Price',
            pricePh:  'e.g., 50000'
        },
        repair: {
            title:    'Service Provider Contact Info (Optional)',
            name:     'Your Full Name (for clients)',
            namePh:   'e.g., John Doe',
            phone:    'Your Phone Number (for clients)',
            phonePh:  'e.g., +2348012345678',
            email:    'Your Contact Email (for clients)',
            emailPh:  'e.g., contact@email.com',
            address:  'Your Location / Service Area',
            addressPh:'e.g., Ikorodu & Mainland, Lagos',
            price:    'Rate / Starting Price',
            pricePh:  'e.g., 50000'
        }
    };
    /* Applies the right label/placeholder set to the Contact Info + Price
       fields for the given category — the service-specific copy above if
       it's one of the four service categories, otherwise the original
       buyer/pickup/price wording (restoring it if the seller had a service
       category selected before switching back). Returns the title string
       so the caller (which already owns #mkt-direct-fields-title) can use
       it too. */
    function _mktApplyContactFieldCopy(catKey) {
        var copy = MKT_SERVICE_CONTACT_LABELS[catKey] || MKT_DEFAULT_CONTACT_LABELS;
        var map = [
            ['mkt-contact-name-label',    'item-seller-name',    'name',    'namePh'],
            ['mkt-contact-phone-label',   'item-seller-phone',   'phone',   'phonePh'],
            ['mkt-contact-email-label',   'item-seller-email',   'email',   'emailPh'],
            ['mkt-contact-address-label', 'item-seller-address', 'address', 'addressPh']
        ];
        map.forEach(function (row) {
            var labelEl = document.getElementById(row[0]);
            var inputEl = document.getElementById(row[1]);
            if (labelEl) labelEl.textContent = copy[row[2]];
            if (inputEl) inputEl.placeholder = copy[row[3]];
        });
        var priceLabel = document.getElementById('mkt-price-field-label');
        var priceInput = document.getElementById('item-price');
        if (priceLabel) priceLabel.textContent = copy.price;
        if (priceInput) priceInput.placeholder = copy.pricePh;
        return copy.title;
    }
    window._mktApplyContactFieldCopy = _mktApplyContactFieldCopy;

    /* ── "No photo yet" placeholder — category-aware, premium classic
       colorway for job/service listings ─────────────────────────────────
       FIX (request — avatar placeholder frame for job & service listings):
       the default no-media medallion (navy + gold) reads as a product-photo
       stand-in, which looks odd on a Job or Service listing that was never
       going to have a "product photo" in the first place. Jobs/Job Seeking/
       Professional Services/Repair & Construction now get their own icon +
       label + a distinct premium classic emerald & antique-gold colorway
       (see .mkt-no-media-service in style.css) instead of the generic one,
       so the placeholder reads as "this is a listing, not a missing photo"
       rather than "this seller forgot to upload a picture". */
    var MKT_NO_MEDIA_VARIANTS = {
        jobs:         { icon: 'fa-briefcase', label: 'Job Vacancy' },
        jobseeking:   { icon: 'fa-user-tie',  label: 'Job Seeker' },
        professional: { icon: 'fa-handshake', label: 'Service Listing' },
        repair:       { icon: 'fa-tools',     label: 'Service Listing' }
    };

    /* ── Premium "Avatar" card — Job Seeking & Professional Services ────────
       FIX (request — a separate, unique card thumbnail for the "service
       rendering" and "seeking employment" categories, distinct from the
       generic product card everything else uses): Job Seeking and
       Professional Services listings represent a PERSON, not a product, so
       instead of the standard photo/video grid these get a horizontally
       scrolling avatar strip (the seller's own avatar first, followed by
       any portfolio/certificate media attached to the listing) plus an
       info panel built around qualifications (service/role type,
       experience level, their own write-up) rather than
       brand/model/condition. The general product-card path (media grid,
       category badge, quick specs, seller-info bar, actions) is untouched
       — app-fixes.js only swaps in these two builders for these two
       categories and keeps everything else (buttons, dataset attributes,
       sort/search wiring) exactly as it already builds it, so the rest of
       the marketplace dashboard logic is unaffected. Rendered full-width
       (see .mkt-avatar-card in style.css) so it reads as a distinct shelf
       wherever it falls in the listings feed. */
    // FIX (request — "job seeker, job, and professional service render are
    // in the same category of card design"): Jobs (vacancy postings) get
    // the same premium avatar-card treatment as Job Seeking / Professional
    // Services — a company posting a vacancy isn't selling a product
    // either. Adding 'jobs' here is the only change needed: every function
    // below (_mktIsAvatarCategory, the avatar card builder, the middle-
    // repositioning pass, the Contact/Message label tailoring in
    // app-patch-v2.js) all key off this one map, so a vacancy listing now
    // automatically gets the same card, same positioning, and "Contact Job
    // Vacancy" / "Message Job Vacancy" wording — no other file needed edits.
    var MKT_AVATAR_CATEGORIES = { professional: 'Service Provider', jobseeking: 'Job Seeker', jobs: 'Job Vacancy' };
    function _mktIsAvatarCategory(catKey) {
        return !!MKT_AVATAR_CATEGORIES[catKey];
    }
    window._mktIsAvatarCategory = _mktIsAvatarCategory;

    /* FIX (request — "these categories ... are not selling products,
       please tailor to suit the services they are rendering"): shared
       label lookup so every place that says "Contact Seller" / "Seller
       Contact" / "Message Seller" (the card's own contact-panel toggle in
       app-patch-v2.js, and the persistent Message Seller button in this
       file) can ask for the right word instead of "Seller" for these two
       categories. Returns null for every other category so callers can
       fall back to their existing "Seller" wording unchanged. */
    function _mktAvatarRoleLabel(catKey) {
        return MKT_AVATAR_CATEGORIES[catKey] || null;
    }
    window._mktAvatarRoleLabel = _mktAvatarRoleLabel;

    function _mktAvatarScrollHTML(item) {
        var name = item.sellerName || item.username || 'Seller';

        /* FIX (request — "instead of the CH [initials medallion], the PDF
           or doc upload credentials of the applicant/job seeker should be
           there, with a small circular avatar picture by the side"): when
           the listing has an uploaded credentials document (résumé,
           certificate, etc — the same item.documents array
           _mktDocumentsHTML already renders as chips lower in the card),
           the top strip leads with that document instead of the plain
           avatar/lettered-initials block. The seller's own photo (or
           initials, if they have none) still shows, just as a small
           circular badge beside it rather than the dominant element.
           Listings with no uploaded documents keep the original
           avatar-strip / lettered-medallion behaviour untouched below. */
        var docs = (item.documents || []).filter(function (d) { return d && d.url; });
        if (docs.length) {
            var doc0     = docs[0];
            var docKind  = doc0.type || _mktFileKind(doc0.name || doc0.url);
            var docIcon  = docKind === 'pdf' ? 'fa-file-pdf' : (docKind === 'doc' ? 'fa-file-word' : (docKind === 'image' ? 'fa-image' : 'fa-file'));
            var docCls   = docKind === 'pdf' ? 'mkt-doc-chip-pdf' : (docKind === 'doc' ? 'mkt-doc-chip-doc' : 'mkt-doc-chip-doc');
            var docLabel = docKind === 'pdf' ? 'PDF' : (docKind === 'doc' ? 'DOC' : (docKind === 'image' ? 'Photo' : 'File'));
            var docTitle = (doc0.name || 'Credentials').trim();
            var avatarUrl = item.sellerAvatar || '';
            var badgeHTML = avatarUrl
                ? '<img src="' + _esc(avatarUrl) + '" alt="' + _esc(name) + '" loading="lazy" onerror="this.closest(\'.mkt-avatar-badge\').classList.add(\'mkt-avatar-initials\');this.remove();">'
                : '<span>' + _esc((name || '?').trim().charAt(0).toUpperCase()) + '</span>';
            return '<div class="mkt-avatar-scroll mkt-avatar-scroll-doc">' +
                '<a class="mkt-avatar-scroll-item mkt-avatar-doc-primary ' + docCls + '" href="' + _esc(doc0.url) + '" target="_blank" rel="noopener" title="' + _esc(docTitle) + '">' +
                    '<i class="fas ' + docIcon + '"></i><span class="mkt-avatar-doc-label">' + _esc(docLabel) + '</span>' +
                '</a>' +
                '<div class="mkt-avatar-scroll-item mkt-avatar-badge' + (avatarUrl ? '' : ' mkt-avatar-initials') + '">' + badgeHTML + '</div>' +
            '</div>';
        }

        var shots = [{ url: item.sellerAvatar || '', isAvatar: true }];
        (item.media || []).forEach(function (u) { if (u) shots.push({ url: u, isAvatar: false }); });
        var hasAny = shots.some(function (s) { return !!s.url; });
        if (!hasAny) {
            // No avatar and no attached portfolio/certificate media — a
            // lettered medallion (first initial of their name) keeps the
            // strip from rendering empty, still in the premium colorway.
            return '<div class="mkt-avatar-scroll mkt-avatar-scroll-empty">' +
                '<div class="mkt-avatar-scroll-item mkt-avatar-main mkt-avatar-initials">' +
                    '<span>' + _esc((name || '?').trim().charAt(0).toUpperCase()) + '</span>' +
                '</div></div>';
        }
        var html = '<div class="mkt-avatar-scroll">';
        shots.forEach(function (s) {
            if (!s.url) return;
            var isVid = /\.(mp4|webm|mov)(\?|$)/i.test(s.url) || /\/video\/upload\//i.test(s.url);
            var cls = 'mkt-avatar-scroll-item' + (s.isAvatar ? ' mkt-avatar-main' : '');
            html += '<div class="' + cls + '">' +
                (isVid
                    ? '<video src="' + s.url + '" muted playsinline preload="metadata" onclick="this.paused?this.play():this.pause()"></video>'
                    : '<img src="' + s.url + '" alt="' + _esc(name) + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'">') +
                '</div>';
        });
        html += '</div>';
        return html;
    }
    window._mktAvatarScrollHTML = _mktAvatarScrollHTML;

    function _mktAvatarInfoHTML(item, priceStr) {
        var catKey = item.category || '';
        var roleLabel = MKT_AVATAR_CATEGORIES[catKey] || 'Listing';
        var fields = item.categoryFields || {};
        // FIX (request — "for job-related entries, the employer should be
        // added immediately after the job category enclosed in brackets"):
        // Jobs (vacancy) listings show the employer/company right after
        // the role badge, e.g. "Job Vacancy (Acme Nigeria Ltd)" — falls
        // back to the poster's own name if no explicit Company field was
        // filled in (older listings, posted before jobsSchema's Company
        // field existed), so the bracket is never left showing nothing.
        var badgeLabel = roleLabel;
        if (catKey === 'jobs') {
            var employer = (fields.company || item.sellerName || item.username || '').trim();
            if (employer) badgeLabel = roleLabel + ' (' + _esc(employer) + ')';
        }
        var chips = '';
        if (fields.serviceType) chips += '<span class="mkt-qual-chip"><i class="fas fa-briefcase"></i> ' + _esc(fields.serviceType) + '</span>';
        if (fields.experience) chips += '<span class="mkt-qual-chip"><i class="fas fa-star"></i> ' + _esc(fields.experience) + '</span>';
        var desc = (item.description || '').trim();
        if (desc.length > 140) desc = desc.slice(0, 140).replace(/\s+\S*$/, '') + '…';
        // FIX (request — "uploaded files should display according to
        // their type"): résumé/certificate/inspection-report uploads for
        // these categories render here as type-labeled chips.
        var docsHTML = _mktDocumentsHTML(item.documents);
        return '<div class="mkt-avatar-info">' +
            '<span class="mkt-cat-badge mkt-avatar-role-badge"><i class="fas fa-user-tie"></i> ' + badgeLabel + '</span>' +
            /* FIX (request — "the position element has not been adjusted
               or moved to the center"): item.name is the ad title — the
               job title/position for a Jobs listing, the seeker's target
               role for Job Seeking, the offering for Professional
               Services. Centering happens via style.css's
               .mkt-avatar-info rule (align-items:center; text-align:
               center) rather than an inline style here, so it stays in
               one place and applies consistently to every element in
               this panel, not just the title. */
            '<h4>' + _esc(item.name || '') + '</h4>' +
            (chips ? '<div class="mkt-avatar-quals">' + chips + '</div>' : '') +
            (desc ? '<p class="mkt-avatar-desc">' + _esc(desc) + '</p>' : '') +
            '<p><i class="fas fa-map-marker-alt"></i> ' + _esc(item.location || '') + '</p>' +
            docsHTML +
            (priceStr ? '<div class="mkt-avatar-price">' + _esc(priceStr) + '</div>' : '') +
        '</div>';
    }
    window._mktAvatarInfoHTML = _mktAvatarInfoHTML;

    /* ── Force avatar cards to the middle of the grid ────────────────────
       FIX (request — "position this card in the middle of the marketplace
       section"): left to the normal newest-first insert, an avatar card
       can land at the very top (if it's the newest listing) or anywhere
       else, purely by chance of posting time. This runs after every
       Firestore batch (see app-fixes.js) and physically relocates every
       .mkt-avatar-card in the grid to (roughly) its numeric center among
       the OTHER cards — recentering as more listings are added/removed —
       without touching sort order, dataset, or any other card.

       FIX (request — "relocate the job service category from the top of
       the marketplace listing to the middle"): the above only ever moved
       the individual cards INTO #mkt-avatar-carousel — the carousel
       element itself stayed exactly where index.html placed it in the
       static markup, i.e. always as a fixed header sitting above the
       entire #property-grid-container, regardless of how many product
       cards existed. This now also relocates the carousel element itself
       into the grid, inserted at the numeric midpoint of the current
       product cards, so the "Jobs & Services" shelf reads as a shelf in
       the middle of the listing feed instead of a permanent top banner.
       grid-column:1/-1 (style.css, #mkt-avatar-carousel) makes it span
       the full row width once nested inside the grid. Re-run on every
       pass, so it re-centers as more listings are added/removed, exactly
       like the per-card centering already did. */
    function _mktRepositionAvatarCards() {
        var grid = document.getElementById('property-grid-container');
        var carousel = document.getElementById('mkt-avatar-carousel');
        var carouselInner = document.getElementById('mkt-avatar-carousel-inner');
        if (!grid || !carousel || !carouselInner) return;
        
        /* Collect all avatar cards from the grid (also matches cards
           still nested inside the carousel from a previous pass) */
        var avatarCards = Array.prototype.slice.call(grid.querySelectorAll('.mkt-avatar-card'));
        if (!avatarCards.length) {
            carousel.style.display = 'none';
            return;
        }
        
        /* Show carousel and clear it */
        carousel.style.display = 'block';
        carouselInner.innerHTML = '';
        
        /* Move all avatar cards to the carousel */
        avatarCards.forEach(function (card) {
            card.remove(); /* Remove from grid first */
            carouselInner.appendChild(card); /* Add to carousel */
            /* FIX (request — "the avatar placeholder frame thumbnail share
               button is not working"): _mktDecorateCard() (which builds the
               share/save icon corner overlay) normally runs off a
               MutationObserver watching #property-grid-container for
               direct-child insertions. An avatar card relocated in here
               only ever became a direct child of #mkt-avatar-carousel-inner
               — a different element — so if this reposition pass ever ran
               before that observer's callback had a chance to fire on the
               card (both can happen on the same tick after a Firestore
               batch), the card could reach the carousel undecorated: no
               share/save icons ever inserted, looking exactly like a
               "share button doesn't work" bug because there was no button
               there to click. Calling it directly here guarantees every
               card in the carousel is decorated regardless of that race —
               _mktDecorateCard's own card._dashDone guard makes this a
               no-op for a card that was already decorated, so re-running
               it on every pass is safe. */
            if (typeof _mktDecorateCard === 'function') _mktDecorateCard(card);
        });

        /* Relocate the carousel element itself to the middle of the grid */
        if (carousel.parentNode) carousel.parentNode.removeChild(carousel);
        var remaining = Array.prototype.slice.call(grid.children);
        var mid = Math.floor(remaining.length / 2);
        var anchor = remaining[mid] || null;
        if (anchor) {
            grid.insertBefore(carousel, anchor);
        } else {
            grid.appendChild(carousel);
        }
    }
    window._mktRepositionAvatarCards = _mktRepositionAvatarCards;
    function _mktNoMediaPlaceholderHTML(catKey) {
        var v = MKT_NO_MEDIA_VARIANTS[catKey];
        var cls = 'mkt-no-media-placeholder' + (v ? ' mkt-no-media-service' : '');
        var icon = v ? v.icon : 'fa-image';
        var label = v ? v.label : 'No Photo Yet';
        return '<div class="' + cls + '">' +
                    '<div class="mkt-no-media-frame"></div>' +
                    '<div class="mkt-no-media-medallion"><i class="fas ' + icon + '"></i></div>' +
                    '<div class="mkt-no-media-rule"></div>' +
                    '<span class="mkt-no-media-label">' + _esc(label) + '</span>' +
               '</div>';
    }
    window._mktNoMediaPlaceholderHTML = _mktNoMediaPlaceholderHTML;

    /* ── Uploaded-document type detection + rendering (PDF / DOC / Image) ──
       FIX (request — "uploaded files should display according to their
       type: PDF files should show as PDF, DOC files should show as DOC,
       pictures should display as images"): app-fixes.js's marketplace-form
       submit handler now uploads whatever was selected in the "Upload
       documents" field and saves it as listingData.documents = [{url,
       name, type}]. This renders each one distinctly — an image gets a
       real thumbnail, a PDF gets a red PDF chip, a Word doc gets a blue
       DOC chip — instead of forcing every uploaded file through the
       photo/video grid treatment that only makes sense for a physical
       item's photos. */
    function _mktFileKind(name) {
        var ext = String(name || '').split('.').pop().toLowerCase();
        if (ext === 'pdf') return 'pdf';
        if (ext === 'doc' || ext === 'docx') return 'doc';
        if (/^(jpe?g|png|gif|webp|bmp|heic)$/.test(ext)) return 'image';
        return 'other';
    }
    window._mktFileKind = _mktFileKind;

    function _mktDocumentsHTML(documents) {
        if (!documents || !documents.length) return '';
        var html = '<div class="mkt-doc-list">';
        documents.forEach(function (d) {
            if (!d || !d.url) return;
            var kind = d.type || _mktFileKind(d.name || d.url);
            var name = (d.name || 'Document').trim();
            /* FIX (request — "Uploaded files should display according to their type: PDF files 
               should show as PDF, DOC files should show as DOC, Pictures should display as images"):
               File-type recognition based on extension or explicit type field, with corresponding icons. */
            if (kind === 'image') {
                html += '<a class="mkt-doc-chip mkt-doc-chip-img" href="' + _esc(d.url) + '" target="_blank" rel="noopener" title="' + _esc(name) + '">' +
                    '<img src="' + _esc(d.url) + '" alt="' + _esc(name) + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'"></a>';
            } else if (kind === 'pdf') {
                html += '<a class="mkt-doc-chip mkt-doc-chip-pdf" href="' + _esc(d.url) + '" target="_blank" rel="noopener" title="' + _esc(name) + '"><i class="fas fa-file-pdf"></i> PDF</a>';
            } else if (kind === 'doc') {
                html += '<a class="mkt-doc-chip mkt-doc-chip-doc" href="' + _esc(d.url) + '" target="_blank" rel="noopener" title="' + _esc(name) + '"><i class="fas fa-file-word"></i> DOC</a>';
            } else {
                html += '<a class="mkt-doc-chip mkt-doc-chip-doc" href="' + _esc(d.url) + '" target="_blank" rel="noopener" title="' + _esc(name) + '"><i class="fas fa-file"></i> FILE</a>';
            }
        });
        html += '</div>';
        return html;
    }
    window._mktDocumentsHTML = _mktDocumentsHTML;

    function _mktSelectOptionsHTML(options, placeholder) {
        return '<option value="">' + _esc(placeholder || 'Select…') + '</option>' +
            options.map(function (o) { return '<option value="' + _esc(o) + '">' + _esc(o) + '</option>'; }).join('');
    }

    function _mktModelFieldHTML(field, brandValue) {
        var models = VEHICLE_MODELS_BY_BRAND[brandValue];
        if (models && models.length) {
            return '<select data-dyn-field="model" id="dyn-model">' + _mktSelectOptionsHTML(models.concat(['Other']), 'Select…') + '</select>';
        }
        return '<input type="text" data-dyn-field="model" id="dyn-model" placeholder="' + _esc(field.placeholder || '') + '">';
    }

    function _mktMultiSelectHTML(field) {
        var hiddenId = 'dyn-' + field.key + '-value';
        var groupsHTML = field.groups.map(function (g) {
            return (g.title ? '<div class="mkt-multiselect-group-title">' + _esc(g.title) + '</div>' : '') +
                g.items.map(function (item) {
                    return '<label class="mkt-multiselect-option"><input type="checkbox" value="' + _esc(item) + '"> ' + _esc(item) + '</label>';
                }).join('');
        }).join('');
        return '<div class="mkt-multiselect" data-mkt-key="' + _esc(field.key) + '">' +
            '<button type="button" class="mkt-multiselect-btn">' +
                '<span class="mkt-multiselect-label">' + _esc(field.label) + '<span class="mkt-multiselect-count" style="display:none;"></span></span>' +
                _mktIcon('chevron', 16) +
            '</button>' +
            '<div class="mkt-multiselect-panel">' + groupsHTML + '</div>' +
            '<div class="mkt-multiselect-chips"></div>' +
            '<input type="hidden" data-dyn-field="' + _esc(field.key) + '" id="' + hiddenId + '">' +
        '</div>';
    }

    function _mktFieldHTML(field, catKey) {
        /* FIX (request — Vehicle "Local Used" sub-dropdown): a field with
           `dependsOn` starts hidden and is only revealed once the field it
           depends on (by key) matches the given value — wired up in
           _mktRenderDynamicFields below. Marked with a data attribute so
           that wiring code can find it without re-walking the schema. */
        var dependsAttr = field.dependsOn
            ? ' data-depends-on="' + _esc(field.dependsOn.key) + '" data-depends-value="' + _esc(field.dependsOn.value) + '" style="display:none;"'
            : '';
        if (field.type === 'multiselect') {
            return '<div class="form-group"' + dependsAttr + '>' + _mktMultiSelectHTML(field) + '</div>';
        }
        if (field.type === 'vehicle-model') {
            return '<div class="form-group"' + dependsAttr + '><label for="dyn-model">' + _esc(field.label) + '</label>' + _mktModelFieldHTML(field, '') + '</div>';
        }
        if (field.type === 'select') {
            return '<div class="form-group"' + dependsAttr + '><label for="dyn-' + _esc(field.key) + '">' + _esc(field.label) + '</label>' +
                '<select data-dyn-field="' + _esc(field.key) + '" id="dyn-' + _esc(field.key) + '">' + _mktSelectOptionsHTML(field.options) + '</select></div>';
        }
        /* text / number */
        return '<div class="form-group"' + dependsAttr + '><label for="dyn-' + _esc(field.key) + '">' + _esc(field.label) + '</label>' +
            '<input type="' + (field.type === 'number' ? 'number' : 'text') + '" data-dyn-field="' + _esc(field.key) + '" id="dyn-' + _esc(field.key) + '" placeholder="' + _esc(field.placeholder || '') + '"></div>';
    }

    function _mktWireMultiSelects(container) {
        container.querySelectorAll('.mkt-multiselect').forEach(function (wrap) {
            if (wrap._wired) return;
            wrap._wired = true;
            var btn    = wrap.querySelector('.mkt-multiselect-btn');
            var panel  = wrap.querySelector('.mkt-multiselect-panel');
            var chips  = wrap.querySelector('.mkt-multiselect-chips');
            var hidden = wrap.querySelector('input[type="hidden"]');
            var count  = wrap.querySelector('.mkt-multiselect-count');

            function refresh() {
                var checked = Array.prototype.slice.call(panel.querySelectorAll('input[type="checkbox"]:checked')).map(function (c) { return c.value; });
                hidden.value = checked.join(', ');
                if (checked.length) { count.style.display = ''; count.textContent = checked.length; }
                else { count.style.display = 'none'; }
                chips.innerHTML = checked.map(function (v) {
                    return '<span class="mkt-multiselect-chip">' + _esc(v) + ' <span class="remove-chip" data-val="' + _esc(v) + '">&times;</span></span>';
                }).join('');
            }

            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                wrap.classList.toggle('open');
            });
            panel.addEventListener('change', refresh);
            chips.addEventListener('click', function (e) {
                var x = e.target.closest('.remove-chip');
                if (!x) return;
                var cb = panel.querySelector('input[type="checkbox"][value="' + CSS.escape(x.dataset.val) + '"]');
                if (cb) cb.checked = false;
                refresh();
            });
            document.addEventListener('click', function (e) {
                if (!wrap.contains(e.target)) wrap.classList.remove('open');
            });
        });
    }

    /* ── Build the category-specific Ad Details fields for the chosen
       category, replacing whatever was there for the previous category. ── */
    function _mktRenderDynamicFields(catKey) {
        var container = document.getElementById('mkt-dynamic-fields');
        if (!container) return;
        var schema = _mktSchemaForCategory(catKey);
        container.innerHTML = schema.map(function (f) { return _mktFieldHTML(f, catKey); }).join('');

        /* REMOVED (request — Vehicle & Truck section adjustments,
           2026-08-09): Model is now a plain free-text field (see
           MKT_CATEGORY_FIELD_SCHEMAS.vehicles above), no longer a
           'vehicle-model' select dependent on Brand — so there is nothing
           left for a brand-change listener to repopulate. _mktModelFieldHTML
           is left in place (no-deletion convention) but is now unused. */

        _mktWireMultiSelects(container);

        /* FIX (request — Vehicle "Local Used" sub-dropdown): generic wiring
           for any field carrying [data-depends-on] — shows/hides it as its
           controlling field's value changes, and clears its own stored
           value whenever it's hidden so a stale "Used - Registered" value
           can't silently survive on a listing whose Condition was changed
           away from "Local Used" afterwards. Not vehicle-specific code (any
           future schema can use `dependsOn` the same way). */
        container.querySelectorAll('[data-depends-on]').forEach(function (depEl) {
            var controllerKey = depEl.dataset.dependsOn;
            var requiredValue = depEl.dataset.dependsValue;
            var controller = container.querySelector('[data-dyn-field="' + controllerKey + '"]');
            if (!controller) return;
            function _sync() {
                var match = controller.value === requiredValue;
                depEl.style.display = match ? '' : 'none';
                if (!match) {
                    var depField = depEl.querySelector('[data-dyn-field]');
                    if (depField) depField.value = '';
                }
            }
            controller.addEventListener('change', _sync);
            _sync();
        });
    }
    window._mktRenderDynamicFields = _mktRenderDynamicFields;

    /* ── Sell flow, step 1: flat top-level category chooser ────────────────
       FIX (bug — tapping a category like "Vehicles" used to expand its
       subcategories inline within this same list, an accordion; per direct
       request each category now advances to its own dedicated page/step
       instead — see _mktShowCategoryOnly() below, which now swaps in
       #mkt-sell-subcategory-step rather than toggling an "open" class). */
    function _mktBuildSellCategoryStep() {
        var list = document.getElementById('mkt-sell-category-list');
        if (!list || list._built) return;
        list._built = true;
        list.innerHTML = MKT_MASTER_CATEGORIES.map(function (c) {
            return '<div class="mkt-sell-cat-row" data-cat="' + c.key + '">' +
                '<button type="button" class="mkt-sell-cat-head" data-cat="' + c.key + '">' + _mktIcon(c.icon, 18) +
                '<span class="mkt-sell-cat-label">' + _esc(c.label) + '</span>' +
                '<span class="mkt-sell-cat-chevron">' + _mktIcon('chevron', 16) + '</span></button></div>';
        }).join('');

        list.addEventListener('click', function (e) {
            var head = e.target.closest('.mkt-sell-cat-head');
            if (!head) return;
            var catKey = head.dataset.cat;
            var def = _mktCatDef(catKey);
            if (def && def.sub && def.sub.length) {
                /* Has subcategories — advance to the dedicated subcategory
                   page (its own bookmarkable URL via pushState, and its own
                   screen — the list above is hidden entirely, not expanded
                   in place). */
                _mktNavigateInPlace({ mktView: 'sell', mktCat: catKey }, function () {
                    _mktShowCategoryOnly(catKey);
                });
            } else {
                /* No subcategories for this category — nothing to choose
                   between, so go straight to its Ad Details step (same
                   sentinel the old inline "Continue" button used). */
                _mktNavigateInPlace({ mktView: 'sell', mktCat: catKey, mktSub: '__none__' }, function () {
                    _mktShowAdDetailsStep(catKey, '');
                });
            }
        });

        var subList = document.getElementById('mkt-sell-subcategory-list');
        if (subList) subList.addEventListener('click', function (e) {
            var subBtn = e.target.closest('.mkt-sell-cat-sub-btn');
            if (!subBtn) return;
            var cat = subBtn.dataset.cat;
            var sub = subBtn.dataset.sub || '';
            _mktNavigateInPlace({ mktView: 'sell', mktCat: cat, mktSub: sub || '__none__' }, function () {
                _mktShowAdDetailsStep(cat, sub);
            });
        });

        var subBackBtn = document.getElementById('mkt-sell-subcat-back-btn');
        if (subBackBtn) subBackBtn.addEventListener('click', function () {
            _mktNavigateInPlace({ mktView: 'sell' }, function () { _mktShowCategoryOnly(null); });
        });
    }

    /* Swaps the full-page Sell-flow view between the top-level category
       list and a given category's dedicated subcategory page — a genuine
       screen swap (each step hides the other entirely) rather than an
       inline accordion expand/collapse. catKey null/falsy returns to the
       top-level list. Used both by the category-head tap above and by
       _mktApplyDeepLinkFromURL below when someone opens/bookmarks a
       ?mktView=sell&mktCat=... link directly (a genuine reload). */
    function _mktShowCategoryOnly(catKey) {
        var listStep = document.getElementById('mkt-sell-category-step');
        var subStep  = document.getElementById('mkt-sell-subcategory-step');
        var subList  = document.getElementById('mkt-sell-subcategory-list');
        var subTitle = document.getElementById('mkt-sell-subcategory-title');
        if (!listStep || !subStep) return;

        if (!catKey) {
            subStep.style.display = 'none';
            listStep.style.display = '';
            listStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        var def = _mktCatDef(catKey);
        if (!def) return;
        if (subTitle) subTitle.innerHTML = _mktIcon(def.icon, 18) + ' ' + _esc(def.label);
        if (subList) {
            subList.innerHTML = (def.sub || []).map(function (s) {
                return '<button type="button" class="mkt-sell-cat-sub-btn" data-cat="' + def.key + '" data-sub="' + _esc(s) + '">' + _esc(s) + '<span class="mkt-sell-cat-chevron">' + _mktIcon('chevron', 16) + '</span></button>';
            }).join('');
        }
        listStep.style.display = 'none';
        subStep.style.display = '';
        subStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ── Sell flow, step 2: category-specific "Ad Details" form ─────────── */
    function _mktShowAdDetailsStep(catKey, subLabel) {
        var def = _mktCatDef(catKey);
        var catInput = document.getElementById('item-category');
        var subInput = document.getElementById('item-subcategory');
        var chosen   = document.getElementById('mkt-sell-chosen-cat');
        var step1    = document.getElementById('mkt-sell-category-step');
        var subStep  = document.getElementById('mkt-sell-subcategory-step');
        var panel    = document.getElementById('marketplace-create-panel');
        if (catInput) catInput.value = catKey;
        if (subInput) subInput.value = subLabel || '';
        if (chosen) chosen.innerHTML = (def ? _mktIcon(def.icon, 14) : '') + ' ' + (def ? _esc(def.label) : '') + (subLabel ? ' <span>› ' + _esc(subLabel) + '</span>' : '');
        /* Each category gets its own distinct set of "Ad Details" columns —
           rebuilt fresh here rather than reusing one shared field set. */
        _mktRenderDynamicFields(catKey);
        _mktInitLocationCascade(catKey);

        /* FIX (request — Escrow/Direct Sales shouldn't appear for service
           categories): Jobs, Job Seeking, Professional Services and Repair
           & Construction aren't a product changing hands through escrow —
           they're paid as a rate/salary directly to the person offering
           the service, so the whole Sales Type choice (and its "Escrow is
           recommended…" copy) is meaningless there. For those categories
           only: hide the Sales Type selector, force the underlying value
           to 'direct' (so submission/card-rendering — which already only
           know escrow vs. direct — render a normal "Contact" listing
           rather than an "Add to Cart" one), and always reveal the contact
           fields since that's how a buyer/employer actually reaches the
           person. Every non-service category is completely unaffected. */
        var isServiceCat = MKT_CATEGORY_SCHEMA_MAP[catKey] === 'services';
        /* FIX (request — hide Sales Type completely from Vehicles &
           Trucks, contact via WhatsApp phone number only): the whole
           'vehicles' top-level category (Cars, Passenger Buses, Trucks &
           Trailers, etc.) no longer offers an Escrow/Direct choice at
           all — it's folded into the same "no Sales Type" path as the
           service categories below, so the selector is hidden entirely
           and the underlying value is forced to 'direct' (cards then
           render as a normal "Contact Seller" listing rather than an
           "Add to Cart" one — see the salesType==='escrow' checks in
           app-feed.js/app-fixes.js). This supersedes the earlier
           escrow-only-for-vehicles behavior. */
        var isVehicleCat = catKey === 'vehicles';
        var salesGroup   = document.getElementById('mkt-sales-type-group');
        var salesSelect  = document.getElementById('sales-type');
        var directFields = document.getElementById('direct-sales-fields');
        var pricingTitle = document.getElementById('mkt-pricing-section-title');
        var directTitle  = document.getElementById('mkt-direct-fields-title');
        /* Tailor the Contact Info + Price field labels/placeholders to this
           category — job/service-appropriate copy for the four service
           categories, the original buyer/pickup/price copy for everything
           else (also restores it if switching back from a service
           category). Also drives #mkt-direct-fields-title so the section
           heading and its fields always agree. */
        var contactTitle = _mktApplyContactFieldCopy(catKey);

        if (salesGroup) salesGroup.style.display = (isServiceCat || isVehicleCat) ? 'none' : '';
        if (pricingTitle) pricingTitle.textContent = (isServiceCat || isVehicleCat) ? 'Pricing' : 'Pricing & Sale Type';
        if (isVehicleCat) {
            /* FIX (request — "Remove the contact information for direct
               sales since it's no longer functioning"): Name/Phone/Email/
               Address were already individually hidden for Vehicles &
               Trucks further below (see the nameGroup/phoneGroup/
               emailGroup/addressGroup block — a buyer reaches a vehicle
               seller through in-app "Message Seller" chat instead, no
               contact fields needed). But THIS container was still being
               force-opened with `directFields.style.display = 'block'`
               a few lines below (the same branch service categories use,
               which still legitimately shows real fields for them) —
               so Vehicles ended up with the "Contact Info for Direct
               Sale" heading visibly rendered with nothing underneath it,
               exactly the empty/broken-looking section reported. Vehicles
               now gets its own branch that hides the whole block, title
               included, instead of opening an empty shell. Service
               categories (isServiceCat) are unaffected — they still hit
               the `else` branch below with directFields genuinely shown,
               fields and all. */
            if (salesSelect) { salesSelect.value = 'direct'; salesSelect.required = false; }
            if (directFields) {
                directFields.style.display = 'none';
                directFields.querySelectorAll('input').forEach(function (inp) { inp.required = false; });
            }
        } else if (isServiceCat) {
            if (salesSelect) { salesSelect.value = 'direct'; salesSelect.required = false; }
            if (directFields) {
                directFields.style.display = 'block';
                directFields.querySelectorAll('input').forEach(function (inp) { inp.required = false; });
            }
            if (directTitle) directTitle.textContent = contactTitle;
        } else {
            if (salesSelect) salesSelect.required = true;
            if (directTitle) directTitle.textContent = contactTitle;
            /* Restore the normal escrow/direct behavior for a category
               switched back from a service/vehicle one — the #sales-type
               change listener in app-fixes.js drives this from here on. */
            if (salesSelect && directFields) {
                var isDirect = salesSelect.value === 'direct';
                directFields.style.display = isDirect ? 'block' : 'none';
                directFields.querySelectorAll('input').forEach(function (inp) { inp.required = isDirect; });
            }
        }
        /* FIX (request — Vehicle & Truck section adjustments, 2026-08-09):
           "Remove phone number" from Vehicles & Trucks — supersedes the
           earlier "phone number is the ONLY field shown / required for
           Vehicles" behavior documented in the comment this replaces.
           Phone (and Name/Email/Address, already hidden below) is now
           hidden and NOT required for Vehicles, same as the other three
           fields — so no phone number is collected on a vehicle listing,
           and none is written to categoryFields/the listing doc, which is
           what keeps it out of the public feed/API response for privacy.
           A vehicle buyer reaches the seller through the existing in-app
           "Message Seller" chat (app-marketplace.js §9), which needs no
           phone number. Every other (non-vehicle) category is completely
           unaffected — full name / phone / email / address still shows
           exactly as before for them. */
        var nameGroup    = document.getElementById('item-seller-name');
        nameGroup        = nameGroup ? nameGroup.closest('.form-group') : null;
        var phoneInput   = document.getElementById('item-seller-phone');
        var phoneGroup   = phoneInput ? phoneInput.closest('.form-group') : null;
        var emailGroup   = document.getElementById('item-seller-email');
        emailGroup       = emailGroup ? emailGroup.closest('.form-group') : null;
        var addressGroup = document.getElementById('item-seller-address');
        addressGroup     = addressGroup ? addressGroup.closest('.form-group') : null;
        if (nameGroup)    nameGroup.style.display    = isVehicleCat ? 'none' : '';
        if (emailGroup)   emailGroup.style.display   = isVehicleCat ? 'none' : '';
        if (addressGroup) addressGroup.style.display = isVehicleCat ? 'none' : '';
        if (phoneGroup)   phoneGroup.style.display   = isVehicleCat ? 'none' : '';
        if (phoneInput)   phoneInput.required         = false;

        if (step1) step1.style.display = 'none';
        if (subStep) subStep.style.display = 'none';
        if (panel) {
            panel.style.display = '';
            /* Reads as a genuinely new screen for this category, rather than
               a form quietly changing underneath the seller. */
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        _wireAutoName();
        var titleInput = document.getElementById('item-title-override');
        if (titleInput) {
            titleInput.placeholder = MKT_TITLE_PLACEHOLDER_MAP[catKey] || 'e.g., Item Name / Title';
            setTimeout(function () { titleInput.focus(); }, 200);
        }
        _mktApplyAdCopy(catKey);
        _mktApplyMediaDocsCopy(catKey);
    }
    window._mktShowAdDetailsStep = _mktShowAdDetailsStep;

    function _mktBackToCategories() {
        var step1 = document.getElementById('mkt-sell-category-step');
        var subStep = document.getElementById('mkt-sell-subcategory-step');
        var panel = document.getElementById('marketplace-create-panel');
        if (panel) panel.style.display = 'none';
        if (subStep) subStep.style.display = 'none';
        if (step1) { step1.style.display = ''; step1.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
    window._mktBackToCategories = _mktBackToCategories;

    /* item-name (hidden, read by app-fixes.js's submit handler and by
       cards/search/cart) is auto-built from the category's dynamic Ad
       Details fields whenever the seller leaves the Ad Title blank. */
    function _autoDeriveItemName() {
        var nameInput  = document.getElementById('item-name');
        var titleInput = document.getElementById('item-title-override');
        if (!nameInput) return;
        if (titleInput && titleInput.value.trim()) { nameInput.value = titleInput.value.trim(); return; }
        function dv(key) {
            var el = document.querySelector('#mkt-dynamic-fields [data-dyn-field="' + key + '"]');
            return (el && el.value) ? el.value.trim() : '';
        }
        var catKey = document.getElementById('item-category') ? document.getElementById('item-category').value : '';
        var def = _mktCatDef(catKey);
        var name = [dv('year'), dv('brand'), dv('model')].filter(Boolean).join(' ') ||
            (def ? def.label : 'Item');
        nameInput.value = name.trim();
    }
    window._autoDeriveItemName = _autoDeriveItemName;

    function _wireAutoName() {
        var panel = document.getElementById('marketplace-create-panel');
        if (!panel) return;
        if (!panel._autoNameWired) {
            panel._autoNameWired = true;
            panel.addEventListener('input', _autoDeriveItemName);
            panel.addEventListener('change', _autoDeriveItemName);
        }
        _autoDeriveItemName(); /* seed a default right away, whatever fields are present now */
    }

    /* Read back the category's dynamic Ad Details fields — called by
       app-fixes.js's marketplace-form submit handler. Every field rendered
       by _mktRenderDynamicFields() carries a data-dyn-field attribute, so
       this reads whatever schema is currently on screen for the chosen
       category rather than a fixed set of ids. */
    function collectMarketplaceCategoryFields(catKey) {
        var out = {};
        document.querySelectorAll('#mkt-dynamic-fields [data-dyn-field]').forEach(function (el) {
            var key = el.getAttribute('data-dyn-field');
            var val = (el.value != null) ? (el.value.trim ? el.value.trim() : el.value) : '';
            if (val) out[key] = val;
        });
        return out;
    }
    window._collectMarketplaceCategoryFields = collectMarketplaceCategoryFields;

    /* Small badge + quick-spec chips for a card, from stored categoryFields —
       called by app-fixes.js when it builds each property-card. */
    function mktCategoryBadgeHTML(catKey) {
        var def = _mktCatDef(catKey);
        if (!def) return '';
        return '<span class="mkt-cat-badge">' + _mktIcon(def.icon, 13) + ' ' + _esc(def.label) + '</span>';
    }
    window._mktCategoryBadgeHTML = mktCategoryBadgeHTML;

    var MKT_SPEC_LABELS = {
        condition: 'Condition', brand: 'Brand', model: 'Model', year: 'Year', transmission: 'Transmission',
        vtype: 'Type', engine: 'Engine', mileage: 'Mileage', color: 'Color', features: 'Features',
        ptype: 'Property Type', purpose: 'Purpose', size: 'Size', ownership: 'Ownership',
        bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', amenities: 'Amenities',
        itemType: 'Item Type', specs: 'Specs', warranty: 'Warranty',
        serviceType: 'Service Type', experience: 'Experience'
    };
    /* FIX (2026-08-09 — Marketplace Adjustments #3, follow-up): the
       previous fix above only single-line-clamped the 'features' text
       row. The card is still crowded because the regular spec-chip strip
       above it (Condition, Brand, Model, Year, Transmission, Type,
       Engine, Mileage, Color, etc. — every 'shown' key below) wraps
       across two or three rows on its own for a spec-heavy category like
       Vehicles, before the Features row even starts. Same fix, applied
       one level up: the chip strip itself is now wrapped in its own
       clamped container (.mkt-quick-specs-row) that shows only its first
       line by default, with its own Expand/Collapse toggle
       (.mkt-specs-expand-btn) — independent of, and in addition to, the
       Features row's own toggle below (a listing can have both a long
       chip strip AND a long features list; each expands on its own). */
    function mktQuickSpecsHTML(catKey, categoryFields) {
        if (!categoryFields) return '';
        var shown = Object.keys(MKT_SPEC_LABELS).filter(function (k) { return categoryFields[k] && k !== 'features'; });
        var chipsHtml = shown.length
            ? '<div class="mkt-quick-specs-row">' +
              '  <div class="mkt-quick-specs">' + shown.map(function (k) {
                    return '<span class="mkt-quick-spec">' + MKT_SPEC_LABELS[k] + ': ' + _esc(String(categoryFields[k]).slice(0, 60)) + '</span>';
                  }).join('') + '</div>' +
              '  <button type="button" class="mkt-specs-expand-btn">Expand <i class="fas fa-chevron-down"></i></button>' +
              '</div>'
            : '';
        var featuresHtml = '';
        if (categoryFields.features) {
            var fText = _esc(String(categoryFields.features));
            featuresHtml =
                '<div class="mkt-features-row">' +
                '  <div class="mkt-features-text"><strong>Features:</strong> ' + fText + '</div>' +
                '  <button type="button" class="mkt-features-expand-btn">Expand <i class="fas fa-chevron-down"></i></button>' +
                '</div>';
        }
        return chipsHtml + featuresHtml;
    }
    window._mktQuickSpecsHTML = mktQuickSpecsHTML;

    /* Toggle the one-line clamp on a tapped Expand/Collapse button —
       chip strip and Features text each have their own independent
       toggle/state, so expanding one never affects the other. */
    document.addEventListener('click', function (e) {
        var specsBtn = e.target.closest('.mkt-specs-expand-btn');
        if (specsBtn) {
            e.preventDefault();
            e.stopPropagation();
            var specsRow = specsBtn.closest('.mkt-quick-specs-row');
            if (!specsRow) return;
            var specsExpanded = specsRow.classList.toggle('mkt-specs-expanded');
            specsBtn.innerHTML = specsExpanded
                ? 'Collapse <i class="fas fa-chevron-up"></i>'
                : 'Expand <i class="fas fa-chevron-down"></i>';
            return;
        }
        var btn = e.target.closest('.mkt-features-expand-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        var row = btn.closest('.mkt-features-row');
        if (!row) return;
        var expanded = row.classList.toggle('mkt-features-expanded');
        btn.innerHTML = expanded
            ? 'Collapse <i class="fas fa-chevron-up"></i>'
            : 'Expand <i class="fas fa-chevron-down"></i>';
    });

    /* =========================================================================
       §FILTER  Category filter tabs + sort + saved searches for the grid.
       Works purely off dataset attributes already present (or now added by
       app-fixes.js) on .property-card: data-category, data-price,
       data-created-at-ts, data-views. Coexists with the existing free-text
       #marketplace-search-input listener in app-fixes.js — that listener only
       toggles display:none/block on text match; this one applies an
       additional category filter + reorders the DOM for sorting, so both can
       run on the same cards without fighting each other.
       ========================================================================= */

    var _mktActiveCategory = 'all';
    var _mktActiveLocation = '';

    function _cardMatchesActiveCategory(card) {
        if (_mktActiveCategory === 'all') return true;
        return (card.dataset.category || '') === _mktActiveCategory;
    }

    function _cardMatchesActiveLocation(card) {
        if (!_mktActiveLocation) return true;
        return (card.dataset.location || '').toLowerCase().indexOf(_mktActiveLocation.toLowerCase()) !== -1;
    }

    function applyMarketplaceCategoryFilter() {
        var searchInput = document.getElementById('marketplace-search-input');
        var searchHiding = !!(searchInput && searchInput.value.trim());
        document.querySelectorAll('#property-grid-container .property-card').forEach(function (card) {
            if (!_cardMatchesActiveCategory(card) || !_cardMatchesActiveLocation(card)) { card.style.display = 'none'; return; }
            /* Only re-show if the text search isn't itself hiding it right now */
            if (!searchHiding || card.style.display !== 'none') card.style.display = '';
        });
    }
    window._applyMarketplaceCategoryFilter = applyMarketplaceCategoryFilter;

    function applyMarketplaceSort(mode) {
        var grid = document.getElementById('property-grid-container');
        if (!grid) return;
        var cards = Array.prototype.slice.call(grid.querySelectorAll('.property-card'));
        cards.sort(function (a, b) {
            if (mode === 'price-low')  return (parseFloat(a.dataset.price) || 0) - (parseFloat(b.dataset.price) || 0);
            if (mode === 'price-high') return (parseFloat(b.dataset.price) || 0) - (parseFloat(a.dataset.price) || 0);
            if (mode === 'most-viewed') return (parseInt(b.dataset.views, 10) || 0) - (parseInt(a.dataset.views, 10) || 0);
            /* newest */
            return (parseInt(b.dataset.createdAtTs, 10) || 0) - (parseInt(a.dataset.createdAtTs, 10) || 0);
        });
        cards.forEach(function (c) { grid.appendChild(c); });
    }
    window._applyMarketplaceSort = applyMarketplaceSort;

    function _savedSearchesStore() {
        try { return JSON.parse(localStorage.getItem('empMktSavedSearches') || '[]'); } catch (e) { return []; }
    }
    function _renderSavedSearchChips() {
        var wrap = document.getElementById('mkt-saved-searches');
        if (!wrap) return;
        var saved = _savedSearchesStore();
        wrap.innerHTML = saved.map(function (s, i) {
            return '<span class="mkt-saved-search-chip" data-idx="' + i + '"><i class="fas fa-search"></i> ' +
                _esc(s.term || '(any)') + (s.category !== 'all' ? ' · ' + _esc(s.category) : '') +
                ' <span class="remove-chip" data-remove="' + i + '">&times;</span></span>';
        }).join('');
    }

    function _initMarketplaceFilterBar() {
        var bar = document.getElementById('mkt-filter-bar');
        if (!bar || bar._wired) return;
        bar._wired = true;

        bar.querySelectorAll('.mkt-filter-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                bar.querySelectorAll('.mkt-filter-tab').forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');
                _mktActiveCategory = tab.dataset.cat;
                applyMarketplaceCategoryFilter();
            });
        });

        var sortSel = document.getElementById('mkt-sort-select');
        if (sortSel) sortSel.addEventListener('change', function () {
            applyMarketplaceSort(sortSel.value);
            /* FIX (request — "ensure the card for job seekers and
               professional service rendering categories are visible and
               positioned in the middle... with the horizontal
               scrollability function"): applyMarketplaceSort() re-parents
               EVERY .property-card it finds — including the avatar cards
               currently living inside #mkt-avatar-carousel-inner — as a
               direct child of the grid, in sorted order. That silently
               pulls each Job/Job-Seeking/Professional-Service card out of
               the horizontal-scroll shelf and scatters them individually
               into the normal product grid instead, undoing
               _mktRepositionAvatarCards()'s work. Re-running it right
               after a sort rebuilds the shelf (and re-centers it) from
               whatever the new card order left behind, instead of leaving
               it broken until the next unrelated Firestore update or
               section re-entry silently fixes it. */
            if (typeof window._mktRepositionAvatarCards === 'function') window._mktRepositionAvatarCards();
        });

        var saveBtn = document.getElementById('mkt-save-search-btn');
        if (saveBtn) saveBtn.addEventListener('click', function () {
            var term = (document.getElementById('marketplace-search-input') || {}).value || '';
            var saved = _savedSearchesStore();
            saved.unshift({ term: term.trim(), category: _mktActiveCategory });
            saved = saved.slice(0, 8);
            localStorage.setItem('empMktSavedSearches', JSON.stringify(saved));
            _renderSavedSearchChips();
            _notify('Search saved.', 'success');
        });

        var savedWrap = document.getElementById('mkt-saved-searches');
        if (savedWrap) savedWrap.addEventListener('click', function (e) {
            var removeIdx = e.target.getAttribute && e.target.getAttribute('data-remove');
            if (removeIdx != null) {
                var saved = _savedSearchesStore();
                saved.splice(parseInt(removeIdx, 10), 1);
                localStorage.setItem('empMktSavedSearches', JSON.stringify(saved));
                _renderSavedSearchChips();
                return;
            }
            var chip = e.target.closest('.mkt-saved-search-chip');
            if (!chip) return;
            var idx = parseInt(chip.dataset.idx, 10);
            var s = _savedSearchesStore()[idx];
            if (!s) return;
            var searchInput = document.getElementById('marketplace-search-input');
            if (searchInput) { searchInput.value = s.term; searchInput.dispatchEvent(new Event('input')); }
            var targetTab = bar.querySelector('.mkt-filter-tab[data-cat="' + s.category + '"]');
            if (targetTab) targetTab.click();
        });

        _renderSavedSearchChips();

        /* General vs. specific-category search select — the dropdown row
           was removed from the marketplace UI per follow-up request (the
           search bar alone was judged sufficient and the extra row felt
           bulky). This wiring is left in place, dormant, since
           #mkt-category-select no longer exists in the DOM. */
        var catSelect = document.getElementById('mkt-category-select');
        if (catSelect) catSelect.addEventListener('change', function () {
            _mktActiveCategory = catSelect.value;
            applyMarketplaceCategoryFilter();
        });
    }

    /* Search button (and Enter key) now actually *does* something: instead
       of only live-filtering the grid the person is already looking at, it
       jumps straight to the Search view with the term applied, in place —
       via pushState (its own address-bar URL, no reload) rather than
       window.open(), which — as §DEEPLINK below explains — reloads the
       whole SPA and drops the session on this same-origin app. The
       existing live-filter-as-you-type behavior (app-fixes.js's
       #marketplace-search-input listener) is untouched and still runs. */
    function _mktSearchSubmit(term) {
        var input = document.getElementById('marketplace-search-input');
        term = (term != null ? term : (input ? input.value : '')).trim();
        if (!term) { if (input) input.focus(); return; }
        _mktNavigateInPlace({ mktView: 'search', mktQ: term }, function () {
            _mktSetActiveTab('search');
            if (input) {
                input.value = term;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    }

    /* Delegated listeners on document instead of binding directly to the
       button/input: those elements are wired on three separate triggers
       (page ready, empyrean-init-done, empyrean-section-change) at
       different timeouts, and a direct-binding approach risks the guard
       flag getting set on the input before the button has actually landed
       in the DOM — silently skipping the click listener forever. A single
       delegated pair below removes that timing dependency entirely: it
       works the first time, no matter when the elements appear. */
    var _mktSearchDelegated = false;
    function _mktWireSearchSubmit() {
        if (_mktSearchDelegated) return;
        _mktSearchDelegated = true;
        document.addEventListener('click', function (e) {
            if (e.target.closest('#mkt-search-submit-btn')) _mktSearchSubmit();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target && e.target.id === 'marketplace-search-input') {
                e.preventDefault();
                _mktSearchSubmit();
            }
        });
    }

    /* =========================================================================
       §GRID-VIEW TOGGLE (request — Marketplace Home Page "Grid view system",
       2026-08-09): #mkt-view-toggle-btn (index.html, next to the search bar)
       flips #property-grid-container between the normal single-card layout
       and a paired 2-column grid layout (`.mkt-grid-view` class — see
       style.css for the actual column/sizing rules). State is remembered
       per-device via localStorage so it survives a reload, not just a
       single visit — read once on init, then kept in sync on every tap.
       ========================================================================= */
    var MKT_VIEW_STORAGE_KEY = 'empyrean_mkt_grid_view';
    function _mktApplyViewMode(isGrid) {
        var grid = document.getElementById('property-grid-container');
        var btn  = document.getElementById('mkt-view-toggle-btn');
        if (grid) grid.classList.toggle('mkt-grid-view', !!isGrid);
        if (btn) {
            btn.classList.toggle('active-view', !!isGrid);
            btn.innerHTML = isGrid ? '<i class="fas fa-bars"></i>' : '<i class="fas fa-th-large"></i>';
            btn.title = isGrid ? 'Switch to single-card view' : 'Switch to grid view';
        }
    }
    function _mktInitViewToggle() {
        var btn = document.getElementById('mkt-view-toggle-btn');
        if (!btn || btn._mktViewWired) return;
        btn._mktViewWired = true;
        var saved = false;
        try { saved = localStorage.getItem(MKT_VIEW_STORAGE_KEY) === '1'; } catch (e) {}
        _mktApplyViewMode(saved);
        btn.addEventListener('click', function () {
            var grid = document.getElementById('property-grid-container');
            var next = !(grid && grid.classList.contains('mkt-grid-view'));
            _mktApplyViewMode(next);
            try { localStorage.setItem(MKT_VIEW_STORAGE_KEY, next ? '1' : '0'); } catch (e) {}
        });
    }

    /* Auto-suggest: as the seller types the item name, surface similar
       already-posted titles in the active category (best-effort, DOM-only —
       no extra Firestore reads). */
    function _initItemNameAutoSuggest() {
        var input = document.getElementById('item-name');
        if (!input || input._pvSuggestWired) return;
        input._pvSuggestWired = true;
        var list = document.createElement('datalist');
        list.id = 'mkt-item-name-suggestions';
        input.setAttribute('list', 'mkt-item-name-suggestions');
        input.parentNode.appendChild(list);
        input.addEventListener('focus', function () {
            var seen = {};
            list.innerHTML = '';
            document.querySelectorAll('#property-grid-container .property-card').forEach(function (card) {
                var n = card.dataset.name;
                if (n && !seen[n]) {
                    seen[n] = true;
                    var opt = document.createElement('option');
                    opt.value = n;
                    list.appendChild(opt);
                }
            });
        });
    }

    _ready(function () {
        setTimeout(_mktBuildSellCategoryStep, 300);
        setTimeout(_mktWireBackButton, 300);
        setTimeout(_initMarketplaceFilterBar, 300);
        setTimeout(_initItemNameAutoSuggest, 300);
        setTimeout(_mktWireSearchSubmit, 300);
        setTimeout(_mktInitViewToggle, 300);
    });
    document.addEventListener('empyrean-init-done', function () {
        setTimeout(_mktBuildSellCategoryStep, 400);
        setTimeout(_mktWireBackButton, 400);
        setTimeout(_initMarketplaceFilterBar, 400);
        setTimeout(_initItemNameAutoSuggest, 500);
        setTimeout(_mktWireSearchSubmit, 400);
        setTimeout(_mktInitViewToggle, 400);
    });
    document.addEventListener('empyrean-section-change', function (ev) {
        if (ev && ev.detail && ev.detail.section === 'marketplace') {
            setTimeout(_mktBuildSellCategoryStep, 150);
            setTimeout(_mktWireBackButton, 150);
            setTimeout(_initMarketplaceFilterBar, 150);
            setTimeout(_initItemNameAutoSuggest, 150);
            setTimeout(_mktWireSearchSubmit, 150);
            setTimeout(_mktInitViewToggle, 150);
            /* FIX (request — "job and services category card ... was no
               longer there after the last fix, please restore"):
               _mktRepositionAvatarCards() previously only ran from
               app-fixes.js's Firestore onSnapshot callback, i.e. once per
               batch of listing changes — not on every visit to the
               Marketplace section. Any visit after that listener's
               initial batch had already passed (e.g. navigating away and
               back) left avatar cards sitting wherever they were last
               left, and the #mkt-avatar-carousel shelf never
               (re)positioned into the middle of the grid. Re-running it
               here, every time the section is entered, is additive —
               the listener-driven call is untouched — and self-heals
               the shelf regardless of how the grid got into its current
               state. */
            setTimeout(function () {
                if (typeof window._mktRepositionAvatarCards === 'function') window._mktRepositionAvatarCards();
            }, 350);
        }
    });

    /* ── Bootstrap ── */
    document.addEventListener('empyrean-init-done', function () {
        setTimeout(renderMarketplaceCards, 300);
        setTimeout(updateCartUI, 400);
        /* Ensure any already-rendered cards (both escrow & direct sales) have owner action buttons */
        setTimeout(function () {
            document.querySelectorAll('.property-card').forEach(function (card) {
                _ensureOwnerActions(card);
                _ensureMessageSellerButton(card);
            });
        }, 600);
    });

    /* Re-apply owner actions/message button whenever new cards are injected into the DOM */
    var _mktObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (!node.querySelectorAll) return;
                node.querySelectorAll('.property-card').forEach(function (card) {
                    _ensureOwnerActions(card);
                    _ensureMessageSellerButton(card);
                });
                if (node.classList && node.classList.contains('property-card')) {
                    _ensureOwnerActions(node);
                    _ensureMessageSellerButton(node);
                }
            });
        });
    });
    _mktObserver.observe(document.body, { childList: true, subtree: true });

    /* =========================================================================
       §DASHBOARD  Marketplace "Dashboard" UI overhaul (screenshot-matched),
       merged directly into this module per follow-up request — no separate
       patch file. Everything above (categories, cascading posting fields,
       escrow/direct sales, KYC hooks, edit/delete/promote/contact/cart,
       the live Firestore renderer in app-fixes.js) is untouched. This
       section only adds:
         • a "browse by category" icon grid on the Home tab
         • post-hoc decoration of each already-rendered .property-card
           (ribbons, share/save icons, video play overlay, rating line,
           pill Contact button) — same DOM-decoration pattern already used
           above by _ensureOwnerActions()/_ensureMessageSellerButton()
         • the .mkt-filter-tab / #mkt-sort-select / #mkt-save-search-btn /
           #mkt-saved-searches markup that §FILTER above (
           _initMarketplaceFilterBar, applyMarketplaceCategoryFilter,
           applyMarketplaceSort) was already written to use but never had
         • a Home/Saved/Search/Sell/Profile bottom bar scoped to
           #marketplace, auto-reset to "Home" every time the section opens
       CSS for all of this lives in style.css (see its own "MARKETPLACE
       DASHBOARD" block) rather than being injected here.
       ========================================================================= */

    var MKT_SAVED_KEY = 'empMktSavedItems';

    function _mktSavedIds() {
        try { return JSON.parse(localStorage.getItem(MKT_SAVED_KEY) || '[]'); }
        catch (e) { return []; }
    }
    function _mktIsSaved(id) { return _mktSavedIds().indexOf(id) !== -1; }
    function _mktToggleSaved(id) {
        var list = _mktSavedIds();
        var idx = list.indexOf(id);
        if (idx === -1) { list.push(id); } else { list.splice(idx, 1); }
        localStorage.setItem(MKT_SAVED_KEY, JSON.stringify(list));
        return idx === -1; /* true = now saved */
    }

    function _mktBuildCategoryGrid() {
        if (document.getElementById('mkt-dash-categories')) return;
        var searchBar = document.getElementById('mkt-filter-bar');
        if (!searchBar) return;

        var wrap = document.createElement('div');
        wrap.id = 'mkt-dash-categories';
        wrap.className = 'mkt-dash-categories';
        wrap.innerHTML = MKT_MASTER_CATEGORIES.map(function (c) {
            return '<button type="button" class="mkt-dash-cat-item" data-key="' + _esc(c.key) + '">' +
                '<span class="mkt-dash-cat-icon">' + _mktIcon(c.icon, 26) + '</span>' +
                '<span class="mkt-dash-cat-label">' + _esc(c.label) + '</span></button>';
        }).join('');
        searchBar.insertAdjacentElement('afterend', wrap);

        /* FIX: this used to stuff the category's label into the free-text
           search box (e.g. "vehicles"), which only ever matches a listing
           whose title/location literally contains that word — so tapping
           a category almost never surfaced any of the real listings
           actually posted under it. Filter by the listing's real stored
           category key instead, the same way the toolbar's category tabs
           already do, so every listed item in that category shows up. */
        wrap.addEventListener('click', function (e) {
            var btn = e.target.closest('.mkt-dash-cat-item');
            if (!btn) return;
            var key = btn.dataset.key;
            var input = document.getElementById('marketplace-search-input');
            if (input && input.value) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
            _mktNavigateInPlace({ mktView: 'search' }, function () {
                _mktSetActiveTab('search');
                var tab = document.querySelector('.mkt-filter-tab[data-cat="' + key + '"]');
                if (tab) tab.click();
            });
        });
    }

    /* Category-filter tabs + sort select + saved-search markup that
       _initMarketplaceFilterBar() above was already coded to wire up. Built
       from MKT_MASTER_CATEGORIES so the tab keys always match whatever
       category key the Sell flow actually saves onto a listing. */
    function _mktBuildFilterToolbar() {
        if (document.getElementById('mkt-search-toolbar')) return;
        var searchBar = document.getElementById('mkt-filter-bar');
        if (!searchBar) return;

        var toolbar = document.createElement('div');
        toolbar.id = 'mkt-search-toolbar';
        toolbar.innerHTML =
            '<div class="mkt-filter-tabs-row">' +
                '<button type="button" class="mkt-filter-tab active" data-cat="all">All</button>' +
                MKT_MASTER_CATEGORIES.map(function (c) {
                    return '<button type="button" class="mkt-filter-tab" data-cat="' + c.key + '">' + _esc(c.label) + '</button>';
                }).join('') +
            '</div>' +
            '<div class="mkt-sort-save-row">' +
                '<select id="mkt-sort-select">' +
                    '<option value="newest">Newest</option>' +
                    '<option value="most-viewed">Most Viewed</option>' +
                    '<option value="price-low">Price: Low to High</option>' +
                    '<option value="price-high">Price: High to Low</option>' +
                '</select>' +
                /* FIX (request — "Enable location-based search filters"):
                   the free-text search already substring-matches against
                   card.dataset.location (app-fixes.js's #marketplace-
                   search-input listener), but that only helps a buyer who
                   already knows the state name to type. This adds an
                   explicit dropdown of every Nigerian state — buyers can
                   now narrow by state without typing anything — wired in
                   _initMarketplaceFilterBar() below, and it composes with
                   the existing category tabs / text search rather than
                   replacing them. */
                '<select id="mkt-location-filter-select">' +
                    '<option value="">All Locations</option>' +
                    Object.keys(NIGERIA_STATES_LGAS).sort().map(function (st) {
                        return '<option value="' + _esc(st) + '">' + _esc(st) + '</option>';
                    }).join('') +
                '</select>' +
                '<button type="button" id="mkt-save-search-btn"><i class="fas fa-bookmark"></i> Save Search</button>' +
            '</div>' +
            '<div id="mkt-saved-searches"></div>';
        searchBar.insertAdjacentElement('afterend', toolbar);
    }

    function _mktBuildFeaturedHeading() {
        var grid = document.getElementById('property-grid-container');
        if (!grid || document.getElementById('mkt-dash-featured-title')) return;
        var h = document.createElement('div');
        h.id = 'mkt-dash-featured-title';
        h.className = 'mkt-dash-section-title';
        h.textContent = 'Featured Listings';
        grid.insertAdjacentElement('beforebegin', h);
    }

    var _mktRatingCache = {}; /* sellerId -> {avg,count} | 'pending' */
    function _mktFetchRating(sellerId, cb) {
        if (!sellerId) { cb(0, 0); return; }
        var cached = _mktRatingCache[sellerId];
        if (cached && cached !== 'pending') { cb(cached.avg, cached.count); return; }
        if (cached === 'pending') return;
        var db = window.fbDb;
        if (!db) { cb(0, 0); return; }
        _mktRatingCache[sellerId] = 'pending';
        db.collection('marketplace_reviews').where('sellerId', '==', sellerId).get()
            .then(function (snap) {
                var sum = 0, count = 0;
                snap.forEach(function (d) {
                    var r = d.data();
                    sum += parseFloat(r.rating) || 0;
                    count++;
                });
                var avg = count ? (sum / count) : 0;
                _mktRatingCache[sellerId] = { avg: avg, count: count };
                cb(avg, count);
            })
            .catch(function () { _mktRatingCache[sellerId] = { avg: 0, count: 0 }; cb(0, 0); });
    }

    function _mktStarsHTML(avg) {
        avg = Math.max(0, Math.min(5, avg || 0));
        var full = Math.floor(avg), half = (avg - full) >= 0.5, html = '';
        for (var i = 0; i < full; i++) html += '<i class="fas fa-star"></i>';
        if (half) html += '<i class="fas fa-star-half-alt"></i>';
        for (var j = full + (half ? 1 : 0); j < 5; j++) html += '<i class="far fa-star"></i>';
        return html;
    }

    /* Post-hoc decoration of one already-rendered .property-card. Never
       edits the card's existing media/title/price/actions markup — only
       wraps/adds around it, same pattern as _ensureOwnerActions() above. */
    function _mktDecorateCard(card) {
        if (!card || card._dashDone) return;
        card._dashDone = true;

        // FIX: on a normal card, card.firstElementChild is just the photo,
        // so wrapping it and overlaying share/save icons in its corner is
        // safe. On an avatar card (Job Seeking / Professional Services)
        // the first child is .mkt-avatar-top — the whole media+info row —
        // and wrapping THAT would float the icons on top of the name and
        // qualification text instead of the photo strip. Target just the
        // scroll strip for avatar cards so the icons land where a photo
        // corner badge is expected.
        var isAvatarCard = card.classList.contains('mkt-avatar-card');
        var mediaEl = isAvatarCard ? card.querySelector('.mkt-avatar-scroll') : card.firstElementChild;
        if (!mediaEl) return;

        var wrap = document.createElement('div');
        wrap.className = 'mkt-card-media-wrap';
        mediaEl.parentNode.insertBefore(wrap, mediaEl);
        wrap.appendChild(mediaEl);

        var ribbons = document.createElement('div');
        ribbons.className = 'mkt-ribbons';
        var ribbonHTML = '';
        if (card.dataset.promoted === 'true') ribbonHTML += '<span class="mkt-ribbon mkt-ribbon-featured">Featured Ad</span>';
        /* FIX (request — "Vehicle column: Hide the escrow icon"): the
           "Escrow Protected" ribbon is suppressed on Vehicles listings
           only — every other escrow category keeps the badge unchanged. */
        if (card.dataset.salesType === 'escrow' && card.dataset.category !== 'vehicles') ribbonHTML += '<span class="mkt-ribbon mkt-ribbon-verified"><i class="fas fa-shield-halved"></i> Escrow Protected</span>';
        ribbons.innerHTML = ribbonHTML;
        if (ribbonHTML) wrap.appendChild(ribbons);

        /* FIX (request — "insert total number of media upload indicator"):
           standard product cards already get a "camera + N" count badge
           for multi-media listings (.mkt-carousel-count-badge — see
           app-fixes.js's card builder, which bakes it straight into the
           carousel markup at build time). Avatar cards (Job Seeking /
           Professional Services / Jobs) never got the same treatment for
           their own uploaded portfolio media, since _mktAvatarScrollHTML's
           strip (.mkt-avatar-scroll) IS the scrolling element itself — a
           badge baked in as its child would scroll away with the strip
           instead of staying pinned in the corner. Added here instead,
           straight into `wrap` (.mkt-card-media-wrap — already
           position:relative and already non-scrolling, the same stable
           anchor the ribbons/share/save icons above use), reusing
           card.dataset.media (already stored by app-fixes.js's card
           builder) so this needs no change to that builder or to
           _mktAvatarScrollHTML. Counts only the listing's own uploaded
           media, not the seller's avatar photo — matching what the
           standard badge counts — and only appears for 2+ items, same
           threshold the standard badge already uses. */
        if (isAvatarCard) {
            var _mktAvatarMediaCount = 0;
            try {
                var _mktAvatarMediaArr = JSON.parse(card.dataset.media || '[]');
                _mktAvatarMediaCount = Array.isArray(_mktAvatarMediaArr)
                    ? _mktAvatarMediaArr.filter(function (u) { return !!u; }).length
                    : 0;
            } catch (eParse) { _mktAvatarMediaCount = 0; }
            if (_mktAvatarMediaCount > 1) {
                var avatarCountBadge = document.createElement('span');
                avatarCountBadge.className = 'mkt-carousel-count-badge';
                avatarCountBadge.innerHTML = '<i class="fas fa-camera"></i> ' + _mktAvatarMediaCount;
                wrap.appendChild(avatarCountBadge);
            }
        }

        var itemId = card.dataset.id;
        var actions = document.createElement('div');
        actions.className = 'mkt-icon-actions';
        actions.innerHTML =
            /* FIX (follow-up — "still retained the old icon"): the fa-arrow-
               up-from-bracket Font Awesome glyph was never actually swapped
               out. Replacing it here with the exact same inline SVG "share
               nodes" icon already used everywhere else in the app (feed
               posts — app-feed.js, business pages — app-business.js's
               #biz-share-btn) so the marketplace card's overlay icon now
               visually matches, not just behaves like, the rest of the app. */
            '<button type="button" class="mkt-icon-btn mkt-share-icon" title="Share"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>' +
            '<button type="button" class="mkt-icon-btn mkt-save-icon' + (_mktIsSaved(itemId) ? ' mkt-saved' : '') + '" title="Save"><i class="' + (_mktIsSaved(itemId) ? 'fas' : 'far') + ' fa-heart"></i></button>';
        wrap.appendChild(actions);

        /* FIX (request — "the share button is not working" / "replace the
           old style share button with the recent [one] implemented in
           other sections"): the old handler called window.shareContent(),
           which does `await navigator.clipboard.writeText(...)` BEFORE
           calling navigator.share(). Once a click handler awaits anything,
           it's no longer running inside the original synchronous user-
           gesture call stack — several mobile browsers (notably iOS
           Safari, and some Android WebViews) then silently refuse
           navigator.share() with a NotAllowedError, since it's treated as
           no longer user-initiated. That's the actual root cause of the
           icon appearing to do nothing.
           app-fix-final.js's own §45 share handler (used by feed posts,
           business pages, news, SOS/crisis cards — the "other sections"
           this request refers to) already gets this right: navigator.share
           is called FIRST and synchronously, with clipboard-copy only as a
           fallback if the native sheet isn't available or errors, and —
           on desktop/browsers with neither — routes into
           window._empShowShareSheet(url), the same proper share-sheet UI
           those other sections use, instead of a bare clipboard toast.
           Deliberately NOT funnelled through §45's document-level
           delegated listener itself: that handler also writes a
           shareCount/mining Firestore update keyed off _col45(card), which
           only recognises post/business/crisis/SOS collections and has no
           branch for marketplace_listings — routing marketplace clicks
           through it would misfile that Firestore write the same way
           crisis/SOS cards used to before _col45 was fixed for THEM (see
           the comment on _col45 in app-fix-final.js). This keeps
           marketplace's own share icon independent, correctly-ordered,
           and only reuses the parts of the "recent" implementation that
           are safe to share (the synchronous-share-first ordering, and
           the _empShowShareSheet fallback UI) — no Firestore/mining side
           effects grafted on that this card was never designed for.
           _mktShareBusy guards the same "works once then freezes" failure
           mode app-fixes.js's own shareContent() rewrite already fixed —
           an overlapping second tap while the first native share sheet is
           still resolving becomes a safe no-op instead of a thrown
           InvalidStateError. */
        actions.querySelector('.mkt-share-icon').addEventListener('click', function (e) {
            e.stopPropagation();
            var btn = e.currentTarget;
            if (btn._mktShareBusy) return;
            var shareUrl = location.href.split('#')[0].split('?')[0] + '?post=' + itemId;
            var shareTitle = card.dataset.name || 'Marketplace listing';
            if (typeof navigator.share === 'function') {
                btn._mktShareBusy = true;
                navigator.share({ title: shareTitle, text: shareTitle, url: shareUrl })
                    .catch(function (err) {
                        if (err && err.name !== 'AbortError') {
                            if (typeof window._empShowShareSheet === 'function') window._empShowShareSheet(shareUrl);
                            else if (navigator.clipboard) navigator.clipboard.writeText(shareUrl).then(function () { _notify('Link copied to clipboard!', 'success'); }).catch(function () {});
                        }
                    })
                    .finally(function () { btn._mktShareBusy = false; });
            } else if (typeof window._empShowShareSheet === 'function') {
                window._empShowShareSheet(shareUrl);
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(shareUrl)
                    .then(function () { _notify('Link copied to clipboard!', 'success'); })
                    .catch(function () { _notify('Unable to copy link.', 'error'); });
            } else {
                _notify('Sharing not supported on this browser.', 'error');
            }
            if (typeof window.rewardUserForAction === 'function') window.rewardUserForAction('SHARE_POST');
        });
        actions.querySelector('.mkt-save-icon').addEventListener('click', function (e) {
            e.stopPropagation();
            var nowSaved = _mktToggleSaved(itemId);
            var btn = e.currentTarget, icon = btn.querySelector('i');
            btn.classList.toggle('mkt-saved', nowSaved);
            icon.className = (nowSaved ? 'fas' : 'far') + ' fa-heart';
            _notify(nowSaved ? 'Saved to your list' : 'Removed from saved', 'success');
            var section = document.getElementById('marketplace');
            if (section && section.dataset.mktTab === 'saved') _mktApplySavedFilter();
        });

        if (mediaEl.tagName === 'VIDEO' || wrap.querySelector('video')) {
            var play = document.createElement('div');
            play.className = 'mkt-play-overlay';
            play.innerHTML = '<i class="fas fa-play"></i>';
            wrap.appendChild(play);
        }

        var priceDiv = card.querySelector('.property-info > div:last-child');
        if (priceDiv && card.dataset.oldPrice) {
            var old = document.createElement('span');
            old.className = 'mkt-price-old';
            old.textContent = card.dataset.oldPrice;
            priceDiv.classList.add('mkt-price-row');
            priceDiv.insertBefore(old, priceDiv.firstChild);
        }

        var actionsBlock = card.querySelector('.property-actions');
        if (actionsBlock) {
            var ratingRow = document.createElement('div');
            ratingRow.className = 'mkt-rating-contact-row';
            var ratingLine = document.createElement('span');
            ratingLine.className = 'mkt-rating-line';
            ratingLine.innerHTML = _mktStarsHTML(0) + ' No rating';
            ratingRow.appendChild(ratingLine);
            actionsBlock.parentNode.insertBefore(ratingRow, actionsBlock);
            actionsBlock.style.marginTop = '0';

            var sellerId = card.dataset.sellerId;
            if (sellerId) {
                _mktFetchRating(sellerId, function (avg, count) {
                    ratingLine.innerHTML = count
                        ? _mktStarsHTML(avg) + ' ' + avg.toFixed(1) + ' (' + count + ')'
                        : _mktStarsHTML(0) + ' No rating';
                });
            }
        }
    }

    function _mktDecorateAllCards() {
        document.querySelectorAll('#property-grid-container .property-card').forEach(_mktDecorateCard);
    }

    /* =========================================================================
       §3b  Dashboard-strip quick-contact icons  ("New in Marketplace")
       FIX (request — "Card thumbnail in the marketplace in the general
       public dashboard: Add a WhatsApp number and message icon visible to
       buyers... clickable... auto-generate a response message containing
       the product/car card link"): the compact .dashboard-market-card
       thumbnail (home-feed horizontal strip) previously had no way to
       contact the seller at all — tapping it only navigated to the
       Marketplace section generically. Overlays two small round icon
       buttons in the card's bottom-right corner instead: WhatsApp (wa.me,
       pre-filled with a message containing this listing's shareable link)
       and Message (opens the in-app marketplace chat overlay). Purely
       additive — doesn't touch the existing thumbnail/name/price markup,
       same "wrap and overlay" approach _mktDecorateCard uses above.
       ========================================================================= */
    function _mktDecorateDashboardCard(card) {
        if (!card || card._dashIconsDone) return;
        card._dashIconsDone = true;

        var us = _us();
        var sellerId = card.dataset.sellerId || '';
        var isOwner = _isAdmin() || (us.id && sellerId && sellerId === us.id);
        if (isOwner || !sellerId) return; /* no quick-contact icons on your own listing, or with no seller to contact */

        var itemId   = card.dataset.id || '';
        var itemName = (card.querySelector('h5') || {}).textContent || 'this listing';
        /* FIX (request — WhatsApp auto-reply link should resolve to the
           product's own card thumbnail server-side). See the matching
           comment on the Share-button link above for the full reasoning —
           same '?post=' query-param fix, applied here too. */
        var shareLink = location.href.split('#')[0].split('?')[0] + '?post=' + itemId;

        var overlay = document.createElement('div');
        overlay.className = 'mkt-dash-quickcontact';
        /* FIX (request — Marketplace Communication Adjustments, 2026-08-09):
           "Remove direct message inbox" / "Add direct phone call icon" —
           the message icon (which opened the in-app chat overlay) is now a
           plain tel: call icon, revealed only once a phone number is
           resolved — same reveal path the WhatsApp icon already used
           (dataset first, Firestore fallback below). No in-app chat/inbox
           entry point remains on this card. */
        overlay.innerHTML =
            '<a class="mkt-dash-icon-btn mkt-dash-call-icon" title="Call Seller" style="display:none;"><i class="fas fa-phone"></i></a>' +
            '<a class="mkt-dash-icon-btn mkt-dash-wa-icon" title="Chat on WhatsApp" target="_blank" rel="noopener" style="display:none;"><i class="fab fa-whatsapp"></i></a>';
        card.style.position = card.style.position || 'relative';
        card.appendChild(overlay);

        var callIcon = overlay.querySelector('.mkt-dash-call-icon');
        callIcon.addEventListener('click', function (e) { e.stopPropagation(); });

        var waIcon = overlay.querySelector('.mkt-dash-wa-icon');
        function _revealWa(phone) {
            var digits = String(phone || '').replace(/\D/g, '');
            if (!digits) return;
            if (digits.charAt(0) === '0') digits = '234' + digits.slice(1);
            var waMsg = 'Hi, I\'m interested in "' + itemName + '" — ' + shareLink;
            waIcon.href = 'https://wa.me/' + digits + '?text=' + encodeURIComponent(waMsg);
            waIcon.style.display = '';
            var telDigits = String(phone || '').replace(/[^\d+]/g, '');
            if (telDigits) { callIcon.href = 'tel:' + telDigits; callIcon.style.display = ''; }
        }
        waIcon.addEventListener('click', function (e) { e.stopPropagation(); });

        var cPhone = card.dataset.contactPhone || card.dataset.phone || '';
        if (cPhone) {
            _revealWa(cPhone);
        } else if (window._firebaseLoaded && window.fbDb) {
            window.fbDb.collection('marketplace_listings').doc(itemId).get()
                .then(function (doc) {
                    if (!doc.exists) return;
                    var d = doc.data() || {};
                    if (d.contactPhone || d.phone) _revealWa(d.contactPhone || d.phone);
                })
                .catch(function () { /* WhatsApp icon just stays hidden */ });
        }
    }

    function _mktDecorateAllDashboardCards() {
        document.querySelectorAll('#dashboard-market-slider .dashboard-market-card').forEach(_mktDecorateDashboardCard);
    }

    function _mktWatchDashboardCards() {
        var slider = document.getElementById('dashboard-market-slider');
        if (!slider || slider._dashIconsWatched) return;
        slider._dashIconsWatched = true;
        new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                m.addedNodes.forEach(function (n) {
                    if (n.nodeType === 1 && n.classList && n.classList.contains('dashboard-market-card')) {
                        _mktDecorateDashboardCard(n);
                    }
                });
            });
        }).observe(slider, { childList: true });
    }

    /* One-time CSS for the dashboard-strip quick-contact icon overlay */
    (function _injectDashQuickContactCSS() {
        if (document.getElementById('_mkt_dash_qc_style')) return;
        var s = document.createElement('style');
        s.id = '_mkt_dash_qc_style';
        s.textContent = [
            '.mkt-dash-quickcontact{ position:absolute; right:6px; bottom:6px; display:flex; gap:6px; z-index:3; }',
            '.mkt-dash-icon-btn{ width:30px; height:30px; border-radius:50%; border:none; display:flex; align-items:center; justify-content:center;',
            '  font-size:0.85rem; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.35); text-decoration:none; }',
            '.mkt-dash-msg-icon{ background:linear-gradient(135deg,#1B2B8B,#0A0E27); color:#fff; }',
            '.mkt-dash-wa-icon{ background:#25D366; color:#fff; }',
            '.mkt-dash-icon-btn:active{ opacity:0.75; }'
        ].join('\n');
        document.head.appendChild(s);
    })();

    function _mktWatchNewCards() {
        var grid = document.getElementById('property-grid-container');
        if (!grid || grid._dashWatched) return;
        grid._dashWatched = true;
        new MutationObserver(function (muts) {
            var addedAny = false;
            muts.forEach(function (m) {
                m.addedNodes.forEach(function (n) {
                    if (n.nodeType === 1 && n.classList && n.classList.contains('property-card')) {
                        _mktDecorateCard(n);
                        addedAny = true;
                    }
                });
            });
            if (!addedAny) return;
            /* Re-apply whichever filter the currently active tab expects,
               so a listing that streams in from Firestore mid-session
               doesn't ignore it (see fix note above). */
            var section = document.getElementById('marketplace');
            var tab = section && section.dataset.mktTab;
            if (tab === 'saved') _mktApplySavedFilter();
            else if (tab === 'search' || tab === 'home') applyMarketplaceCategoryFilter();
        }).observe(grid, { childList: true });
    }

    function _mktApplySavedFilter() {
        var saved = _mktSavedIds();
        document.querySelectorAll('#property-grid-container .property-card').forEach(function (card) {
            card.style.display = saved.indexOf(card.dataset.id) !== -1 ? '' : 'none';
        });
        var grid = document.getElementById('property-grid-container');
        var empty = document.getElementById('mkt-saved-empty');
        if (!empty && grid) {
            empty = document.createElement('div');
            empty.id = 'mkt-saved-empty';
            empty.className = 'mkt-saved-empty';
            empty.innerHTML = '<i class="far fa-heart"></i>No saved items yet — tap the heart on any listing to save it here.';
            grid.appendChild(empty);
        }
        if (empty) empty.style.display = saved.length ? 'none' : 'block';
    }

    function _mktClearGridFilter() {
        document.querySelectorAll('#property-grid-container .property-card').forEach(function (card) {
            card.style.display = '';
        });
        var empty = document.getElementById('mkt-saved-empty');
        if (empty) empty.style.display = 'none';
    }

    var MKT_DASH_TABS = [
        { id: 'home', label: 'Home', icon: 'home' },
        { id: 'saved', label: 'Saved', icon: 'heart' },
        /* FIX (request — "add buy icon to the search button, so that once
           they click buy they can search"): relabeled Search → Buy with a
           shopping-bag icon, since search in this section is fundamentally
           a buyer's tool. The tab id stays 'search' on purpose — every
           other piece of wiring (mktView=search deep links, popstate,
           _mktSetActiveTab, the saved-search chips) keys off that id
           string, not the label, so nothing else needed to change. */
        { id: 'search', label: 'Buy', icon: 'bag' },
        { id: 'sell', label: 'Sell', icon: 'store' },
        { id: 'profile', label: 'Profile', icon: 'user' }
    ];

    /* Bar lives at the TOP of #marketplace (sticky), right after the
       "Marketplace" header. It is built once and never removed/rebuilt when
       switching tabs, so it — and only it — persists across every tab. */
    function _mktBuildSubnav() {
        if (document.getElementById('mkt-subnav')) return;
        var section = document.getElementById('marketplace');
        if (!section) return;
        var bar = document.createElement('div');
        bar.id = 'mkt-subnav';
        bar.innerHTML = MKT_DASH_TABS.map(function (t) {
            return '<button type="button" class="mkt-subnav-tab" data-tab="' + t.id + '">' + _mktIcon(t.icon, 19) + '<span>' + t.label + '</span></button>';
        }).join('');
        var header = section.querySelector('.header');
        if (header) header.insertAdjacentElement('afterend', bar);
        else section.insertBefore(bar, section.firstChild);
        bar.addEventListener('click', function (e) {
            var btn = e.target.closest('.mkt-subnav-tab');
            if (!btn) return;
            var tabId = btn.dataset.tab;

            /* Saved: lands directly on the saved-items view as its own step
               (URL updates via pushState — no dashboard flash) WITHOUT
               reloading the app. See §DEEPLINK note below for why this is
               pushState rather than window.open(). */
            if (tabId === 'saved') {
                _mktNavigateInPlace({ mktView: 'saved' }, function () { _mktSetActiveTab('saved'); });
                return;
            }

            _mktSetActiveTab(tabId);
        });
    }

    /* =========================================================================
       §DEEPLINK  Gives Search results, Saved items, and each Sell-flow step
       their own distinct URL — WITHOUT ever reloading the page.

       FIX (2026-07-28): the first version of this used window.open(url,
       '_blank') to open these as real separate browser tabs. In this app's
       runtime that doesn't create a second tab — it re-navigates the
       CURRENT webview to that same-origin URL, i.e. a full reload of the
       whole SPA. Because the custom userState identity this app uses
       (distinct from Firebase Auth — see index.html's bootstrap) is not
       something a hard reload restores on its own, every one of those
       "new tab" taps was silently logging the person out and dropping them
       back at a fresh load. Root cause, not a coincidence: every affected
       action (Saved, Search, Sell category/subcategory) was exactly the
       set that called window.open(); Inbox (a modal, no navigation) and
       the WhatsApp links (an external wa.me domain, not this app) were
       unaffected.
       Fix: use history.pushState instead of window.open. The address bar
       still updates to a distinct, bookmarkable/shareable URL for each
       step (close to a real "separate page" from the user's point of
       view), but nothing ever reloads, so the session survives. A
       popstate listener below makes the device Back button step back
       through these the way real pages would.
       ========================================================================= */
    function _mktBuildDeepLink(params) {
        var url;
        try { url = new URL(location.href); } catch (e) { return location.href; }
        ['mktView', 'mktQ', 'mktCat', 'mktSub'].forEach(function (k) { url.searchParams.delete(k); });
        Object.keys(params || {}).forEach(function (k) {
            var v = params[k];
            if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
        });
        return url.toString();
    }

    /* Pushes the new URL (no reload) then immediately performs the same
       in-app transition applyFn would have run on a real page load — the
       tap feels instant instead of waiting on a navigation. */
    function _mktNavigateInPlace(params, applyFn) {
        try { history.pushState({ mktDeepLink: params }, '', _mktBuildDeepLink(params)); }
        catch (e) { /* pushState can't fail in a way that should block the UI update below */ }
        if (typeof applyFn === 'function') applyFn();
    }
    window._mktNavigateInPlace = _mktNavigateInPlace;

    /* Applies whatever mktView/mktCat/mktSub/mktQ is currently in the URL —
       used both on initial page load (a real reload — e.g. someone reopens
       a bookmarked/shared link) and from the popstate handler (Back/Forward
       button, no reload). */
    function _mktApplyDeepLinkFromURL() {
        var params;
        try { params = new URLSearchParams(location.search); } catch (e) { return; }
        var view = params.get('mktView');
        _mktEnsureDashboardBuilt();
        if (!view) { _mktSetActiveTab('home'); return; }
        if (view === 'saved') {
            _mktSetActiveTab('saved');
        } else if (view === 'search') {
            _mktSetActiveTab('search');
            var q = params.get('mktQ') || '';
            var input = document.getElementById('marketplace-search-input');
            if (input && q) {
                input.value = q;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } else if (view === 'sell') {
            _mktSetActiveTab('sell');
            var cat = params.get('mktCat');
            var sub = params.get('mktSub');
            var catDefForLink = cat ? _mktCatDef(cat) : null;
            if (cat && (!catDefForLink || !catDefForLink.sub || !catDefForLink.sub.length)) {
                /* Category has no subcategories — nothing to show on the
                   subcategory page, so a bookmarked link to it goes
                   straight to Ad Details instead. */
                _mktShowAdDetailsStep(cat, '');
            } else {
                _mktShowCategoryOnly(cat || null);
                /* sub is present (a real subcategory has been picked) once
                   the seller has actually chosen one — go straight to the
                   Ad Details step. */
                if (cat && sub !== null) {
                    _mktShowAdDetailsStep(cat, sub === '__none__' ? '' : sub);
                }
            }
        }
    }

    /* On a genuine page load (bookmark, share, refresh) apply whatever the
       URL says once the marketplace dashboard exists. */
    document.addEventListener('empyrean-init-done', function () {
        setTimeout(function () {
            if (location.search.indexOf('mktView=') !== -1) {
                if (typeof window.navigateTo === 'function') window.navigateTo('marketplace');
                setTimeout(_mktApplyDeepLinkFromURL, 500);
            }
        }, 900);
    });
    /* Back/Forward button — no reload, just re-apply the URL's state. */
    window.addEventListener('popstate', function () {
        var section = document.getElementById('marketplace');
        if (section && section.classList.contains('active')) _mktApplyDeepLinkFromURL();
    });

    /* True tab switching: every call fully closes whatever was open
       before and shows only the requested tab's content — the search
       bar, browse-category grid, filter/sort toolbar, "Featured
       Listings" heading + listings grid, and the "List a New Item" sell
       card are each independently hidden/shown per tab instead of just
       scrolling to or filtering within a page that stayed fully visible. */
    function _mktSetActiveTab(tabId) {
        var section = document.getElementById('marketplace');
        if (!section) return;
        section.dataset.mktTab = tabId;
        document.body.classList.toggle('mkt-hide-menu-toggle', tabId !== 'sell');

        var bar = document.getElementById('mkt-subnav');
        if (bar) {
            bar.querySelectorAll('.mkt-subnav-tab').forEach(function (b) {
                b.classList.toggle('active', b.dataset.tab === tabId);
            });
        }

        var searchBar   = document.getElementById('mkt-filter-bar');
        var catGrid     = document.getElementById('mkt-dash-categories');
        var toolbar     = document.getElementById('mkt-search-toolbar');
        var sellCard    = document.getElementById('marketplace-sell-card');
        var featuredHdg = document.getElementById('mkt-dash-featured-title');
        var grid        = document.getElementById('property-grid-container');

        /* Close everything first — this is the "close the previous tab"
           step — then the switch below opens only what the new tab needs. */
        [searchBar, catGrid, toolbar, sellCard, featuredHdg, grid].forEach(function (el) {
            if (el) el.style.display = 'none';
        });
        if (toolbar) toolbar.classList.remove('mkt-toolbar-visible');
        if (searchBar) searchBar.classList.remove('mkt-search-spotlight');

        switch (tabId) {
            case 'home':
                if (searchBar) searchBar.style.display = '';
                if (catGrid) catGrid.style.display = '';
                if (featuredHdg) featuredHdg.style.display = '';
                if (grid) grid.style.display = '';
                _mktClearGridFilter();
                break;
            case 'saved':
                if (searchBar) searchBar.style.display = '';
                if (featuredHdg) featuredHdg.style.display = '';
                if (grid) grid.style.display = '';
                _mktApplySavedFilter();
                break;
            case 'search':
                if (searchBar) searchBar.style.display = '';
                if (toolbar) { toolbar.style.display = ''; toolbar.classList.add('mkt-toolbar-visible'); }
                if (featuredHdg) featuredHdg.style.display = '';
                if (grid) grid.style.display = '';
                _mktClearGridFilter();
                if (searchBar) {
                    searchBar.classList.add('mkt-search-spotlight');
                    var input = document.getElementById('marketplace-search-input');
                    if (input) setTimeout(function () { input.focus(); }, 300);
                    setTimeout(function () { if (searchBar) searchBar.classList.remove('mkt-search-spotlight'); }, 1800);
                }
                break;
            case 'sell': {
                if (sellCard) sellCard.style.display = '';
                _mktBuildSellCategoryStep();
                var panel = document.getElementById('marketplace-create-panel');
                var step1 = document.getElementById('mkt-sell-category-step');
                /* Land on the category picker every time the Sell tab is
                   opened fresh — a category already mid-selection (panel
                   visible) is left alone so switching tabs and back doesn't
                   throw away what the seller was filling in. */
                if (!panel || panel.style.display === 'none') {
                    if (step1) step1.style.display = '';
                    if (panel) panel.style.display = 'none';
                }
                break;
            }
            case 'profile': {
                var us = _us();
                if (us.id && typeof window._openSellerProfile === 'function') {
                    window._openSellerProfile(us.id);
                } else {
                    _notify('Sign in to view your marketplace profile.', 'info');
                    /* fall back to Home rather than leaving the section blank */
                    if (searchBar) searchBar.style.display = '';
                    if (catGrid) catGrid.style.display = '';
                    if (featuredHdg) featuredHdg.style.display = '';
                    if (grid) grid.style.display = '';
                    section.dataset.mktTab = 'home';
                    if (bar) {
                        bar.querySelectorAll('.mkt-subnav-tab').forEach(function (b) {
                            b.classList.toggle('active', b.dataset.tab === 'home');
                        });
                    }
                }
                break;
            }
        }
    }

    function _mktWireBackButton() {
        var btn = document.getElementById('mkt-sell-back-to-categories');
        if (!btn || btn._wired) return;
        btn._wired = true;
        btn.addEventListener('click', _mktBackToCategories);
    }

    function _mktEnsureDashboardBuilt() {
        _mktBuildSubnav();
        _mktBuildCategoryGrid();
        _mktBuildFilterToolbar();
        _mktBuildFeaturedHeading();
        _mktBuildSellCategoryStep();
        _mktWireBackButton();
        _mktDecorateAllCards();
        _mktWatchNewCards();
        _mktDecorateAllDashboardCards();
        _mktWatchDashboardCards();
    }

    /* FIX (2026-08-10 — "Marketplace should always open on Home, not the
       Sell fill-in form"): _mktNavigateInPlace() (used by the Sell flow's
       category/subcategory/Ad-Details steps, and by Search/Saved) pushes
       ?mktView=sell&mktCat=...&mktSub=... etc. into the URL so those steps
       are bookmarkable/Back-button-able WHILE the person is inside
       Marketplace. Nothing previously removed those params once the person
       left Marketplace for another section — so the URL could still say
       mktView=sell from several navigations ago. The very next tap into
       Marketplace was then treated as a "genuine fresh entry" below, which
       calls _mktApplyDeepLinkFromURL() — and that just reads whatever is
       CURRENTLY in location.search, landing the person straight back in
       the category list / Ad Details form instead of Home. Root cause:
       stale URL state, not the deep-link logic itself (which is correct
       and stays untouched here).
       FIX: the moment we're actually LEAVING an active Marketplace session
       (id !== 'marketplace' AND _mktWasActiveSection was true), strip
       mktView/mktQ/mktCat/mktSub from the URL via history.replaceState —
       no new history entry, so this can't interfere with app-nav.js's own
       Back-button section history. Sell-flow deep links, Back/Forward
       mid-flow, and sharing a listing link all still work exactly as
       before *while inside* Marketplace; this only resets things once the
       person has left, so every fresh entry lands on Home. */
    var _mktDeepLinkParamKeys = ['mktView', 'mktQ', 'mktCat', 'mktSub'];
    function _mktStripDeepLinkParamsFromURL() {
        var url;
        try { url = new URL(location.href); } catch (e) { return; }
        var removedAny = false;
        _mktDeepLinkParamKeys.forEach(function (k) {
            if (url.searchParams.has(k)) { url.searchParams.delete(k); removedAny = true; }
        });
        if (!removedAny) return;
        try { history.replaceState(history.state, '', url.toString()); }
        catch (e) { /* replaceState can't fail in a way that should block navigation */ }
    }

    var _mktWasActiveSection = false;
    document.addEventListener('empyrean-section-change', function (e) {
        var id = e && e.detail && e.detail.section;
        if (id !== 'marketplace') {
            /* Leaving Marketplace entirely — the Sell-tab-only restriction
               on the global menu toggle only applies inside Marketplace, so
               don't leave it hidden on every other section of the app. */
            document.body.classList.remove('mkt-hide-menu-toggle');
            if (_mktWasActiveSection) _mktStripDeepLinkParamsFromURL();
            _mktWasActiveSection = false;
            return;
        }
        _mktEnsureDashboardBuilt();
        /* FIX (Saved tab silently bouncing back to Home): this used to call
           _mktSetActiveTab('home') unconditionally on every fire of this
           event. navigateTo() in app-nav.js dispatches empyrean-section-
           change every time it runs — including a redundant re-trigger
           while Marketplace is already the open section — so a person
           sitting on the Saved (or Search/Sell) tab would get yanked back
           to Home for no visible reason. Only reset to Home on a genuine
           fresh entry (arriving from a different section); a re-fire while
           already inside Marketplace instead re-applies whatever tab/deep
           link the URL currently reflects, leaving the person exactly
           where they were. */
        if (!_mktWasActiveSection) {
            _mktApplyDeepLinkFromURL();
        }
        _mktWasActiveSection = true;
    });

    document.addEventListener('empyrean-init-done', function () {
        var section = document.getElementById('marketplace');
        if (section && section.classList.contains('active')) {
            _mktEnsureDashboardBuilt();
            _mktSetActiveTab('home');
        }
    });

    console.log('[EmpMarket] \u2705 Dashboard UI ready \u2014 browse-category grid, screenshot-styled cards, filter/sort/saved-search toolbar, and Home/Saved/Search/Sell/Profile bottom bar, all merged into this module.');

})();