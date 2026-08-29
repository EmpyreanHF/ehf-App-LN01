/* =============================================================================
   EMPYREAN INTERNATIONAL — TAG ENGINE
   app-tags.js  |  Step 0.6  |  Refactor Roadmap v1.0
   =============================================================================

   PURPOSE
   ───────
   Complete @mention and #hashtag system, extracted from two IIFEs inside
   app-fixes.js (_initMentionSystem and _initTagEngine).  Covers:

     • @mention autocomplete dropdown on all <textarea> elements
     • Keyboard navigation (↑↓ arrows, Enter, Tab, Escape)
     • @mention click → mini profile popup with "View Profile" action
     • #hashtag click → filter popup (count + "Filter feed" button)
     • Read-more / Show-less for long posts and news items (MutationObserver)
     • In-memory trending tag store + Firestore sync
     • Real-time Firestore trending listener
     • Trending widget injected into the dashboard right column
     • Mention notification dispatch → Firestore notifications collection
     • window._processPostTags() — called by post submit handlers
     • handleYoutubeEmbed() — YouTube URL → iframe embed

   LOAD ORDER
   ──────────
   <script src="firebase-init.js">
   <script src="app-state.js">
   <script src="app-helpers.js">          ← showNotification, formatWhatsAppText
   <script src="app-contracts.js">
   <script src="app-notifications.js">   ← pushNotification
   <script src="app-tags.js">            ← THIS FILE
   ... remaining modules ...

   DEPENDS ON
   ──────────
   • window.fbDb              (firebase-init.js) — Firestore queries
   • window.showNotification  (app-helpers.js)
   • window.formatWhatsAppText(app-helpers.js)
   • window.pushNotification  (app-notifications.js)
   • window.userState / window.EmpState — poster identity for mentions
   • window.mockUsers                    — username→id resolution for popup

   PUBLIC API
   ──────────
   window._mentionUserList         — Array<{username, fullName, avatar}>
   window._trendingTags            — { [tag: string]: number }
   window._incrementTag(tag)       — boost a hashtag's trending score
   window._notifyMentionedUser(username, postText, posterName)
   window._processPostTags(text, posterName) — call after every post submit
   window._renderTrendingWidget()  — force-refresh the trending list UI
   window.handleYoutubeEmbed(text) — returns { html, found }

   SECTION MAP
   ───────────
   §1  Mention user list          — Firestore fetch + in-memory cache
   §2  Autocomplete dropdown      — DOM element, show, hide, position
   §3  Textarea input listener    — @mention detection on keyup/input
   §4  Keyboard navigation        — arrows, Enter, Tab, Escape
   §5  @mention click → popup     — mini profile card
   §6  #hashtag click → popup     — filter panel
   §7  Read-more / Show-less      — long post truncation + MutationObserver
   §8  Tag engine bootstrap       — trending store + Firestore load
   §9  _incrementTag              — score bump + Firestore persist
   §10 Mention notification       — _notifyMentionedUser + _processPostTags
   §11 Trending widget            — render, inject, real-time listener
   §12 YouTube embed helper
   §13 Document-level event wiring

   ============================================================================= */

(function empyreanTagsModule() {
    'use strict';

    if (window._empyreanTagsLoaded) {
        console.warn('[EmpTags] Already loaded — skipping duplicate.');
        return;
    }
    window._empyreanTagsLoaded = true;


    /* =========================================================================
       §1  MENTION USER LIST
       Fetched once from Firestore on load; refreshed on empyrean-user-ready.
       ========================================================================= */

    window._mentionUserList = window._mentionUserList || [];

    function _loadMentionUserList() {
        if (typeof window.fbDb === 'undefined' || !window.fbDb) return;
        window.fbDb.collection('users')
            .orderBy('username')
            .limit(200)
            .get()
            .then(function(snap) {
                window._mentionUserList = snap.docs
                    .map(function(d) {
                        return {
                            username: d.data().username  || '',
                            fullName: d.data().fullName  || '',
                            avatar:   d.data().avatar    || ''
                        };
                    })
                    .filter(function(u) { return !!u.username; });
            })
            .catch(function() {});
    }
    // Defer to let Firebase initialise
    setTimeout(_loadMentionUserList, 1500);
    document.addEventListener('empyrean-user-ready', function() {
        setTimeout(_loadMentionUserList, 600);
    });

    /* Runtime state for the active autocomplete session */
    window._mentionActiveInput  = null;
    window._mentionTriggerChar  = null;
    window._mentionQuery        = null;


    /* =========================================================================
       §2  AUTOCOMPLETE DROPDOWN
       ========================================================================= */

    /**
     * Lazily create (or retrieve) the singleton dropdown element.
     * @returns {HTMLElement}
     */
    function _getDropdown() {
        var el = document.getElementById('_mention_dropdown');
        if (!el) {
            el = document.createElement('div');
            el.id = '_mention_dropdown';
            el.setAttribute('role', 'listbox');
            el.style.cssText = [
                'position:fixed',
                'z-index:var(--z-critical, 99999)',
                'background:white',
                'border:1.5px solid rgba(27,43,139,0.18)',
                'border-radius:12px',
                'box-shadow:0 8px 32px rgba(10,14,39,0.18)',
                'max-height:220px',
                'overflow-y:auto',
                'display:none',
                'min-width:200px',
                'padding:6px 0'
            ].join(';');
            document.body.appendChild(el);
        }
        return el;
    }

    /**
     * Hide the dropdown and clear active-mention state.
     */
    function _hideDropdown() {
        var d = document.getElementById('_mention_dropdown');
        if (d) d.style.display = 'none';
        window._mentionActiveInput = null;
        window._mentionTriggerChar = null;
        window._mentionQuery       = null;
    }

    /**
     * Render and position the suggestion list.
     *
     * @param {HTMLTextAreaElement} input
     * @param {string} query        — Characters typed after the trigger
     * @param {string} triggerChar  — '@' (hashtag suggestions not yet implemented)
     * @param {{ left: number, bottom: number }} rect
     */
    function _showSuggestions(input, query, triggerChar, rect) {
        var dropdown = _getDropdown();
        var filtered = [];

        if (triggerChar === '@') {
            filtered = window._mentionUserList.filter(function(u) {
                var q = query.toLowerCase();
                return u.username.toLowerCase().startsWith(q)
                    || u.fullName.toLowerCase().includes(q);
            }).slice(0, 8);
        }

        if (!filtered.length) { _hideDropdown(); return; }

        dropdown.innerHTML = filtered.map(function(u) {
            var av = u.avatar
                || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.username)
                + '&background=1B2B8B&color=fff&size=40';
            return '<div class="_mention_item" role="option" data-username="' + _attr(u.username) + '"'
                + ' style="display:flex;align-items:center;gap:10px;padding:8px 14px;'
                + 'cursor:pointer;border-radius:8px;transition:background 0.15s;">'
                + '<img src="' + _attr(av) + '" loading="lazy"'
                + ' style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;"'
                + ' onerror="this.src=\'https://ui-avatars.com/api/?name=U&background=1B2B8B&color=fff&size=40\'">'
                + '<div>'
                + '<div style="font-weight:700;font-size:0.88rem;color:var(--primary);">@' + _esc(u.username) + '</div>'
                + '<div style="font-size:0.76rem;color:var(--text-muted);">' + _esc(u.fullName) + '</div>'
                + '</div></div>';
        }).join('');

        /* Position */
        dropdown.style.left    = rect.left   + 'px';
        dropdown.style.top     = rect.bottom + 'px';
        dropdown.style.display = 'block';

        window._mentionActiveInput = input;
        window._mentionTriggerChar = triggerChar;
        window._mentionQuery       = query;

        /* Item click — insert chosen value into textarea */
        dropdown.querySelectorAll('._mention_item').forEach(function(item) {
            item.addEventListener('mousedown', function(e) {
                e.preventDefault();
                _insertMention(input, triggerChar, item.dataset.username);
            });
        });
    }

    /**
     * Insert the chosen mention or hashtag into the textarea at the caret.
     * @param {HTMLTextAreaElement} input
     * @param {string} trigger — '@' or '#'
     * @param {string} value   — chosen username or tag (without trigger)
     */
    function _insertMention(input, trigger, value) {
        var val      = input.value;
        var pos      = input.selectionStart;
        var before   = val.substring(0, pos);
        var trigIdx  = before.lastIndexOf(trigger);
        var newVal   = val.substring(0, trigIdx) + trigger + value + ' ' + val.substring(pos);
        input.value  = newVal;
        input.selectionStart = input.selectionEnd = trigIdx + value.length + 2;
        input.focus();
        _hideDropdown();
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }


    /* =========================================================================
       §3  TEXTAREA INPUT LISTENER
       ========================================================================= */

    /**
     * Detect @mentions being typed and show the dropdown.
     * Fires on every keystroke inside any <textarea> in the page (capture phase).
     */
    function _onInput(e) {
        var input = e.target;
        if (!input || input.tagName !== 'TEXTAREA') return;

        var val    = input.value;
        var pos    = input.selectionStart;
        var before = val.substring(0, pos);

        /* Match @word at start or after whitespace/newline */
        var atMatch = before.match(/(?:^|[\s\n])@([a-zA-Z0-9_\.]*)$/);
        if (atMatch) {
            var query = atMatch[1];
            var coords  = input.getBoundingClientRect();
            var dropL   = Math.min(coords.left + 16, window.innerWidth - 220);
            var dropB   = coords.bottom + 4;
            /* If not enough room below, flip above */
            if (dropB + 220 > window.innerHeight) dropB = Math.max(coords.top - 224, 4);
            _showSuggestions(input, query, '@', { left: dropL, bottom: dropB });
        } else {
            _hideDropdown();
        }
    }


    /* =========================================================================
       §4  KEYBOARD NAVIGATION
       ========================================================================= */

    /**
     * Arrow-key navigation, Enter/Tab to select, Escape to dismiss.
     * Only active while the dropdown is visible.
     */
    function _onKeyDown(e) {
        var dropdown = document.getElementById('_mention_dropdown');
        if (!dropdown || dropdown.style.display === 'none') return;

        if (e.key === 'Escape') { _hideDropdown(); return; }

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            var items = Array.from(dropdown.querySelectorAll('._mention_item'));
            var cur   = items.findIndex(function(i) { return i.classList.contains('_active'); });
            items.forEach(function(i) { i.classList.remove('_active'); i.style.background = ''; });
            var next = e.key === 'ArrowDown' ? cur + 1 : cur - 1;
            next = Math.max(0, Math.min(next, items.length - 1));
            if (items[next]) {
                items[next].classList.add('_active');
                items[next].style.background = 'rgba(27,43,139,0.07)';
                items[next].scrollIntoView({ block: 'nearest' });
            }
        }

        if (e.key === 'Enter' || e.key === 'Tab') {
            var active = dropdown.querySelector('._mention_item._active')
                      || dropdown.querySelector('._mention_item');
            if (active && window._mentionActiveInput) {
                e.preventDefault();
                _insertMention(
                    window._mentionActiveInput,
                    window._mentionTriggerChar || '@',
                    active.dataset.username
                );
            }
        }
    }


    /* =========================================================================
       §5  @MENTION CLICK → MINI PROFILE POPUP
       ========================================================================= */

    /**
     * Handle clicks on .mention-tag anchors rendered by formatWhatsAppText().
     * Shows a mini profile card positioned near the link with a "View Profile"
     * button that navigates to the user's full profile.
     *
     * @param {MouseEvent} e
     */
    function _handleMentionClick(e) {
        var mentionLink = e.target.closest('.mention-tag');
        if (!mentionLink) return;
        e.preventDefault();

        var uname = mentionLink.dataset.username;
        if (!uname) return;

        /* Remove stale popup */
        var old = document.getElementById('_mention_profile_popup');
        if (old) old.remove();

        /* Resolve user data */
        var _u = null;
        if (window._mentionUserList) {
            _u = window._mentionUserList.find(function(u) { return u.username === uname; });
        }
        if (!_u && window.mockUsers) {
            _u = Object.values(window.mockUsers).find(function(u) { return u.username === uname; });
        }

        var _av  = (_u && (_u.avatar || _u.profilePhoto))
            || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(uname) + '&background=1B2B8B&color=fff&size=60';
        var _fn  = (_u && (_u.fullName || _u.name)) || uname;
        var _bio = (_u && _u.bio) || '';
        var _flw = (_u && _u.followersCount) || 0;

        var popup = document.createElement('div');
        popup.id = '_mention_profile_popup';
        popup.style.cssText =
            'position:fixed;z-index:var(--z-critical, 99999);background:white;'
            + 'border-radius:16px;box-shadow:0 8px 32px rgba(10,14,39,0.2);'
            + 'padding:16px;min-width:240px;max-width:280px;'
            + 'border:1.5px solid rgba(10,14,39,0.08);';
        popup.innerHTML =
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
            + '<img src="' + _attr(_av) + '" loading="lazy"'
            + '  style="width:48px;height:48px;border-radius:50%;object-fit:cover;'
            + '         flex-shrink:0;border:2px solid var(--secondary);"'
            + '  onerror="this.src=\'https://ui-avatars.com/api/?name=U&background=1B2B8B&color=fff&size=60\'">'
            + '<div>'
            + '<div style="font-weight:700;font-size:0.92rem;color:var(--primary);">' + _esc(_fn) + '</div>'
            + '<div style="font-size:0.78rem;color:var(--text-muted);">@' + _esc(uname) + '</div>'
            + '</div></div>'
            + (_bio ? '<div style="font-size:0.82rem;color:var(--color-neutral-600,#555);margin-bottom:8px;">' + _esc(_bio) + '</div>' : '')
            + '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;">' + _flw + ' followers</div>'
            + '<div style="display:flex;gap:8px;">'
            + '<button class="_mention_view_profile" data-uname="' + _attr(uname) + '"'
            + '  style="flex:1;padding:8px;background:var(--primary);color:white;'
            + '         border:none;border-radius:8px;font-size:0.82rem;font-weight:700;cursor:pointer;">'
            + 'View Profile</button>'
            + '<button class="_mention_popup_close"'
            + '  style="padding:8px 12px;background:rgba(10,14,39,0.07);color:var(--primary);'
            + '         border:none;border-radius:8px;font-size:0.82rem;font-weight:700;cursor:pointer;">✕</button>'
            + '</div>';

        /* Position near the link */
        var rect = mentionLink.getBoundingClientRect();
        var top  = rect.bottom + 8;
        var left = Math.min(rect.left, window.innerWidth - 300);
        if (top + 180 > window.innerHeight) top = rect.top - 190;
        popup.style.top  = top  + 'px';
        popup.style.left = left + 'px';
        document.body.appendChild(popup);

        popup.querySelector('._mention_popup_close').addEventListener('click', function() {
            popup.remove();
        });

        popup.querySelector('._mention_view_profile').addEventListener('click', function() {
            popup.remove();
            /* Resolve uid from mockUsers */
            var _uid = null;
            if (window.mockUsers) {
                var found = Object.entries(window.mockUsers)
                    .find(function(kv) { return kv[1].username === uname; });
                if (found) _uid = found[0];
            }
            if (_uid && typeof window.renderUserProfile === 'function') {
                window.renderUserProfile(_uid);
                if (typeof window.navigateTo === 'function') window.navigateTo('profile');
            } else {
                if (typeof window.navigateTo === 'function') window.navigateTo('profile');
                if (typeof window.showNotification === 'function') {
                    window.showNotification('@' + uname, 'info');
                }
            }
        });

        /* Close on outside click */
        setTimeout(function() {
            document.addEventListener('click', function _closePop(ev) {
                if (!popup.contains(ev.target)) {
                    popup.remove();
                    document.removeEventListener('click', _closePop);
                }
            });
        }, 100);
    }


    /* =========================================================================
       §6  #HASHTAG CLICK → FILTER POPUP
       ========================================================================= */

    /**
     * Handle clicks on .hashtag-tag anchors rendered by formatWhatsAppText().
     * Boosts the tag's trending score and shows a popup with a "Filter feed"
     * button that scrolls to and highlights matching posts.
     *
     * @param {MouseEvent} e
     */
    function _handleHashtagClick(e) {
        var hashLink = e.target.closest('.hashtag-tag');
        if (!hashLink) return;
        e.preventDefault();

        var tag = hashLink.dataset.tag;
        if (!tag) return;

        /* Boost trending score */
        if (typeof window._incrementTag === 'function') window._incrementTag(tag);

        /* Remove stale popup */
        var oldHp = document.getElementById('_hashtag_popup');
        if (oldHp) oldHp.remove();

        /* Count matching posts in the current DOM */
        var _matchPosts = Array.from(
            document.querySelectorAll('.impact-story, .news-list-item')
        ).filter(function(el) {
            var txt = (el.querySelector('.story-content, .news-item-content') || {}).textContent || '';
            return txt.toLowerCase().includes('#' + tag.toLowerCase());
        });

        var hp = document.createElement('div');
        hp.id  = '_hashtag_popup';
        hp.style.cssText =
            'position:fixed;z-index:var(--z-critical, 99999);background:white;'
            + 'border-radius:16px;box-shadow:0 8px 32px rgba(10,14,39,0.2);'
            + 'padding:16px;min-width:240px;max-width:300px;'
            + 'border:1.5px solid rgba(10,14,39,0.08);max-height:320px;overflow-y:auto;';

        var rect2 = hashLink.getBoundingClientRect();
        var top2  = rect2.bottom + 8;
        var left2 = Math.min(rect2.left, window.innerWidth - 320);
        if (top2 + 200 > window.innerHeight) top2 = rect2.top - 210;
        hp.style.top  = top2  + 'px';
        hp.style.left = left2 + 'px';

        hp.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
            + '<strong style="font-size:0.95rem;color:var(--primary);">#' + _esc(tag) + '</strong>'
            + '<button id="_ht_close" style="background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text-muted);">✕</button>'
            + '</div>'
            + '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;">'
            + _matchPosts.length + ' post' + (_matchPosts.length !== 1 ? 's' : '') + ' with this tag'
            + '</div>'
            + '<button id="_ht_filter"'
            + '  style="width:100%;padding:9px;background:var(--accent-color,#F5C518);'
            + '         color:var(--primary);border:none;border-radius:8px;'
            + '         font-size:0.84rem;font-weight:700;cursor:pointer;margin-bottom:4px;">'
            + '<i class="fas fa-filter"></i> Filter feed by #' + _esc(tag) + '</button>';

        document.body.appendChild(hp);

        document.getElementById('_ht_close').addEventListener('click', function() { hp.remove(); });

        document.getElementById('_ht_filter').addEventListener('click', function() {
            hp.remove();
            if (_matchPosts.length > 0) {
                _matchPosts.forEach(function(p, i) {
                    p.style.outline     = i === 0 ? '2px solid var(--accent-color,#F5C518)' : '';
                    p.style.borderRadius = '12px';
                });
                _matchPosts[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(function() {
                    _matchPosts.forEach(function(p) { p.style.outline = ''; });
                }, 3000);
                if (typeof window.showNotification === 'function') {
                    window.showNotification(
                        'Showing ' + _matchPosts.length + ' post(s) tagged #' + tag, 'info'
                    );
                }
            } else {
                if (typeof window.showNotification === 'function') {
                    window.showNotification('No posts found with #' + tag, 'info');
                }
            }
        });

        setTimeout(function() {
            document.addEventListener('click', function _closeHp(ev) {
                if (!hp.contains(ev.target)) {
                    hp.remove();
                    document.removeEventListener('click', _closeHp);
                }
            });
        }, 100);
    }


    /* =========================================================================
       §7  READ-MORE / SHOW-LESS
       ========================================================================= */

    /**
     * Toggle "Read more ▼" / "Show less ▲" on long posts.
     * Works on both feed posts (.story-content) and news items (.news-item-content).
     */
    function _handleReadMore(e) {
        var rmLink = e.target.closest('.post-read-more');
        if (rmLink) {
            e.preventDefault();
            e.stopPropagation();
            var sc = rmLink.closest('.story-content, .news-item-content');
            if (!sc) return;
            var overflow = sc.querySelector('.post-text-overflow');
            var rest     = sc.querySelector('.post-text-rest');
            if (overflow) overflow.style.display = 'none';
            if (rest)     rest.style.display     = 'inline';
            rmLink.style.display = 'none';
            var rl = sc.querySelector('.post-read-less');
            if (rl) rl.style.display = 'inline-block';
            return;
        }

        var rlLink = e.target.closest('.post-read-less');
        if (rlLink) {
            e.preventDefault();
            e.stopPropagation();
            var sc2 = rlLink.closest('.story-content, .news-item-content');
            if (!sc2) return;
            var ov2   = sc2.querySelector('.post-text-overflow');
            var rest2 = sc2.querySelector('.post-text-rest');
            if (ov2)   ov2.style.display   = 'inline';
            if (rest2) rest2.style.display  = 'none';
            rlLink.style.display = 'none';
            var rm2 = sc2.querySelector('.post-read-more');
            if (rm2) rm2.style.display = 'inline-block';
        }
    }

    /**
     * MutationObserver: whenever a .news-list-item is added to the DOM,
     * truncate its body text at 280 visible characters and wrap in
     * read-more / read-less controls.
     */
    var _newsReadMoreObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (!node || node.nodeType !== 1) return;
                var targets = [];
                if (node.classList && node.classList.contains('news-list-item')) targets.push(node);
                if (node.querySelectorAll) {
                    node.querySelectorAll('.news-list-item').forEach(function(n) { targets.push(n); });
                }
                targets.forEach(function(ni) {
                    var p = ni.querySelector('.news-item-content p');
                    if (!p || p.dataset.rmDone) return;
                    p.dataset.rmDone = '1';

                    var full  = p.innerHTML;
                    var plain = p.textContent || '';
                    if (plain.length <= 280) return;

                    /* Walk the HTML, counting visible chars up to 280 */
                    var cutIdx = 0, cnt = 0, inTag = false;
                    for (var ci = 0; ci < full.length && cnt < 280; ci++) {
                        if (full[ci] === '<')  inTag = true;
                        if (!inTag)            cnt++;
                        if (full[ci] === '>')  inTag = false;
                        cutIdx = ci;
                    }

                    var preview = full.substring(0, cutIdx + 1);
                    var rest    = full.substring(cutIdx + 1);
                    p.innerHTML = preview
                        + '<span class="post-text-overflow">…</span>'
                        + '<span class="post-text-rest" style="display:none;">' + rest + '</span>'
                        + '<br>'
                        + '<a href="#" class="post-read-more"'
                        + '  style="font-size:0.82rem;font-weight:700;color:var(--secondary);'
                        + '         text-decoration:none;display:inline-block;margin-top:4px;">Read more ▼</a>'
                        + '<a href="#" class="post-read-less"'
                        + '  style="font-size:0.82rem;font-weight:700;color:var(--secondary);'
                        + '         text-decoration:none;display:none;margin-top:4px;">Show less ▲</a>';
                });
            });
        });
    });
    _newsReadMoreObserver.observe(document.body, { childList: true, subtree: true });


    /* =========================================================================
       §8  TAG ENGINE BOOTSTRAP — TRENDING STORE
       ========================================================================= */

    /** In-memory trending store. key = normalised hashtag, value = score */
    window._trendingTags = window._trendingTags || {};

    /**
     * Fetch the top-20 trending tags from Firestore once on load.
     * Deferred 1.2 s to allow Firebase to initialise first.
     */
    function _loadTrending() {
        if (!window.fbDb) return;
        window.fbDb.collection('trending_tags')
            .orderBy('score', 'desc')
            .limit(20)
            .get()
            .then(function(snap) {
                snap.forEach(function(doc) {
                    window._trendingTags[doc.id] = doc.data().score || 0;
                });
                _renderTrendingWidget();
            })
            .catch(function() {});
    }
    setTimeout(_loadTrending, 1200);


    /* =========================================================================
       §9  _INCREMENT TAG
       ========================================================================= */

    /**
     * Increment a hashtag's trending score by 1 and persist to Firestore.
     * @param {string} tag — Raw tag (without #, may contain uppercase/punctuation)
     */
    function _incrementTag(tag) {
        if (!tag) return;
        var t = tag.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (!t) return;
        window._trendingTags[t] = (window._trendingTags[t] || 0) + 1;

        try {
            if (window.fbDb) {
                window.fbDb.collection('trending_tags').doc(t).set(
                    { tag: t, score: window._trendingTags[t], lastUsed: new Date().toISOString() },
                    { merge: true }
                ).catch(function() {});
            }
        } catch (e) {}

        _renderTrendingWidget();
    }
    window._incrementTag = _incrementTag;


    /* =========================================================================
       §10  MENTION NOTIFICATION + _processPostTags
       ========================================================================= */

    /**
     * Write a mention notification to Firestore for the mentioned user.
     * If the mentioned user is the current user, also shows an immediate
     * in-app push notification.
     *
     * @param {string} mentionedUsername
     * @param {string} postText
     * @param {string} posterName
     * @param {string} [postId] — id of the post the mention appeared in,
     *        stored on the notification so "You've Been Tagged" can link
     *        straight to it (see window.openPostById in app-thread.js).
     * @param {string} [thumbUrl] — first media URL on the post, if any, so
     *        "You've Been Tagged" can render a real thumbnail card instead
     *        of a plain text line.
     */
    function _notifyMentionedUser(mentionedUsername, postText, posterName, postId, thumbUrl) {
        if (!window.fbDb) return;
        var us = (window.EmpState ? window.EmpState.userState : null) || window.userState || {};

        window.fbDb.collection('users')
            .where('username', '==', mentionedUsername)
            .limit(1)
            .get()
            .then(function(snap) {
                if (snap.empty) return;
                var targetDoc = snap.docs[0];
                var notifRef  = window.fbDb.collection('notifications').doc();
                notifRef.set({
                    id:         notifRef.id,
                    type:       'mention',
                    toUserId:   targetDoc.id,
                    fromUserId: us.id      || 'unknown',
                    fromName:   posterName || 'Someone',
                    message:    (posterName || 'Someone') + ' mentioned you in a post',
                    preview:    (postText || '').substring(0, 80),
                    thumb:      thumbUrl || '',
                    postId:     postId || '',
                    read:       false,
                    createdAt:  new Date().toISOString()
                }).catch(function() {});

                /* Immediate push if the target is the current user */
                if (us.id && targetDoc.id === us.id) {
                    if (typeof window.pushNotification === 'function') {
                        window.pushNotification(
                            '📣 You were mentioned by @' + (posterName || 'someone'),
                            'mention'
                        );
                    }
                }
            })
            .catch(function() {});
    }
    window._notifyMentionedUser = _notifyMentionedUser;

    /**
     * Extract all @mentions and #hashtags from a post's text, dispatch
     * mention notifications, and boost trending scores.
     * Call this in every post-submit handler after the text is finalised.
     *
     * @param {string} text       — Raw post text
     * @param {string} posterName — Display name of the posting user
     * @param {string} [postId]   — id of the post being submitted, so
     *        mention notifications can link back to it.
     * @param {string} [thumbUrl] — first media URL on the post, if any, so
     *        mention notifications can carry a real thumbnail.
     */
    window._processPostTags = function _processPostTags(text, posterName, postId, thumbUrl) {
        if (!text) return;

        /* @mentions */
        var mentions = text.match(/(?:^|[\s\n])@([a-zA-Z0-9_\.]+)/g) || [];
        mentions.forEach(function(m) {
            var uname = m.trim().replace('@', '');
            if (uname) _notifyMentionedUser(uname, text, posterName, postId, thumbUrl);
        });

        /* #hashtags */
        var tags = text.match(/(?:^|[\s\n])#([a-zA-Z0-9_]+)/g) || [];
        tags.forEach(function(t) {
            var tag = t.trim().replace('#', '');
            if (tag) _incrementTag(tag);
        });
    };


    /* =========================================================================
       §11  TRENDING WIDGET
       ========================================================================= */

    /**
     * Re-render the content of the trending widget list (#_trending_widget_list).
     * Shows the top-8 hashtags sorted by score, with click-to-filter behaviour.
     */
    function _renderTrendingWidget() {
        var container = document.getElementById('_trending_widget_list');
        if (!container) return;

        var sorted = Object.entries(window._trendingTags)
            .sort(function(a, b) { return b[1] - a[1]; })
            .slice(0, 8);

        if (!sorted.length) {
            container.innerHTML =
                '<p style="font-size:0.8rem;color:var(--text-muted);padding:8px 0;">No trending tags yet.</p>';
            return;
        }

        container.innerHTML = sorted.map(function(entry, i) {
            var tag = entry[0], score = entry[1];
            return '<div class="_trend_item" data-tag="' + _attr(tag) + '"'
                + ' style="display:flex;align-items:center;justify-content:space-between;'
                + '        padding:8px 0;border-bottom:1px solid rgba(10,14,39,0.06);cursor:pointer;">'
                + '<div>'
                + '<span style="font-size:0.72rem;color:var(--text-light,#aaa);">' + (i + 1) + ' · Trending</span><br>'
                + '<strong style="font-size:0.9rem;color:var(--primary);">#' + _esc(tag) + '</strong>'
                + '</div>'
                + '<span style="font-size:0.75rem;color:var(--text-muted);'
                + '             background:rgba(27,43,139,0.08);padding:2px 8px;border-radius:20px;">'
                + score + ' post' + (score !== 1 ? 's' : '') + '</span>'
                + '</div>';
        }).join('');

        /* Click a trending tag → find and scroll to matching posts */
        container.querySelectorAll('._trend_item').forEach(function(el) {
            el.addEventListener('click', function() {
                var t = el.dataset.tag;
                _incrementTag(t);

                /* Simulate .hashtag-tag click if one exists in the DOM */
                var found = false;
                document.querySelectorAll('.hashtag-tag').forEach(function(ht) {
                    if (!found && ht.dataset.tag && ht.dataset.tag.toLowerCase() === t) {
                        ht.click();
                        found = true;
                    }
                });

                /* Scroll to first matching post */
                var matched = Array.from(
                    document.querySelectorAll('.story-content, .news-item-content')
                ).filter(function(c) {
                    return c.textContent.toLowerCase().includes('#' + t);
                });

                if (matched.length > 0) {
                    var anchor = matched[0].closest('.impact-story, .news-list-item, article')
                        || matched[0];
                    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    if (typeof window.showNotification === 'function') {
                        window.showNotification('#' + t + ' — ' + matched.length + ' matching post(s)', 'info');
                    }
                } else {
                    if (typeof window.showNotification === 'function') {
                        window.showNotification('#' + t + ' — No posts found yet', 'info');
                    }
                }
            });
        });
    }
    window._renderTrendingWidget = _renderTrendingWidget;

    /**
     * Create and inject the trending widget card into the right sidebar.
     * Idempotent — skips if already present.
     * Falls back to the dashboard if no right sidebar exists.
     */
    function _injectTrendingWidget() {
        if (document.getElementById('_trending_widget')) return;

        var widget = document.createElement('div');
        widget.id  = '_trending_widget';
        widget.style.cssText =
            'background:white;border-radius:20px;padding:16px;margin-bottom:16px;'
            + 'box-shadow:0 2px 16px rgba(10,14,39,0.07);border:1px solid rgba(10,14,39,0.07);';
        widget.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">'
            + '<span style="font-size:1.1rem;">🔥</span>'
            + '<strong style="font-size:0.92rem;color:var(--primary);">Trending</strong>'
            + '</div>'
            + '<div id="_trending_widget_list"></div>';

        /* Placement priority: right-sidebar → suggested-users parent → dashboard */
        var sidebar = document.getElementById('right-sidebar')
            || (document.getElementById('suggested-users-container')
                && document.getElementById('suggested-users-container').parentElement)
            || document.querySelector('.sidebar-right, .right-col, [class*="right-sidebar"]');

        if (sidebar) {
            sidebar.insertBefore(widget, sidebar.firstChild);
        } else {
            var dash = document.getElementById('dashboard');
            if (dash) dash.appendChild(widget);
        }
        _renderTrendingWidget();
    }
    setTimeout(_injectTrendingWidget, 800);

    /* Re-inject on section navigation */
    document.addEventListener('empyrean:sectionchange', function() {
        setTimeout(function() { _injectTrendingWidget(); _renderTrendingWidget(); }, 300);
    });

    /**
     * Attach a real-time Firestore onSnapshot listener for the trending tags
     * collection.  Only started once (guarded by window._trendingListener).
     */
    function _startTrendingListener() {
        if (!window.fbDb || window._trendingListener) return;
        window._trendingListener = window.fbDb
            .collection('trending_tags')
            .orderBy('score', 'desc')
            .limit(20)
            .onSnapshot(
                function(snap) {
                    snap.forEach(function(doc) {
                        window._trendingTags[doc.id] = doc.data().score || 0;
                    });
                    _renderTrendingWidget();
                },
                function(err) { console.warn('[Trending] listener error:', err); }
            );
    }
    setTimeout(_startTrendingListener, 2000);


    /* =========================================================================
       §12  YOUTUBE EMBED HELPER
       ========================================================================= */

    /**
     * Detect a YouTube URL in post text and return an iframe embed HTML string.
     * If no YouTube URL is found, falls back to formatWhatsAppText().
     *
     * @param {string} text — Raw post text
     * @returns {{ html: string, found: boolean }}
     */
    function handleYoutubeEmbed(text) {
        var ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        var match   = text.match(ytRegex);
        if (match && match[1]) {
            var videoId  = match[1];
            var embedHtml =
                '<div class="story-youtube-embed">'
                + '<iframe src="https://www.youtube.com/embed/' + videoId + '"'
                + ' frameborder="0"'
                + ' allow="accelerometer; autoplay; clipboard-write; encrypted-media;'
                + '        gyroscope; picture-in-picture"'
                + ' allowfullscreen loading="lazy"></iframe>'
                + '</div>';
            return { html: text.replace(ytRegex, embedHtml), found: true };
        }
        return {
            html: '<p>' + (typeof window.formatWhatsAppText === 'function'
                ? window.formatWhatsAppText(text)
                : text) + '</p>',
            found: false
        };
    }
    window.handleYoutubeEmbed = handleYoutubeEmbed;


    /* =========================================================================
       §13  DOCUMENT-LEVEL EVENT WIRING
       All capture-phase to ensure we fire before bubble-phase handlers.
       ========================================================================= */

    /* @mention autocomplete input detection */
    document.addEventListener('input', _onInput, true);

    /* Keyboard navigation for dropdown */
    document.addEventListener('keydown', _onKeyDown, true);

    /* Close dropdown on outside click */
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#_mention_dropdown') && !e.target.matches('textarea')) {
            _hideDropdown();
        }
    }, true);

    /* @mention tag click → mini profile popup */
    document.addEventListener('click', _handleMentionClick);

    /* #hashtag tag click → filter popup */
    document.addEventListener('click', _handleHashtagClick);

    /* Read-more / Show-less toggle */
    document.addEventListener('click', _handleReadMore);


    /* =========================================================================
       PRIVATE UTILITIES
       ========================================================================= */

    /** Safe HTML attribute value encoder */
    function _attr(str) { return String(str || '').replace(/"/g, '&quot;'); }

    /** Safe HTML text content encoder */
    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }


    console.log('[EmpTags] ✅ @mention, #hashtag, trending & read-more systems ready.');

})();