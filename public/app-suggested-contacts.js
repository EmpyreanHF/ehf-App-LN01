/* =============================================================================
   EMPYREAN INTERNATIONAL — SUGGESTED CONTACTS SIDEBAR
   app-suggested-contacts.js  |  NEW FILE  |  Load AFTER app-nav.js, app-notifications.js,
                                              app-fixes.js (needs mockUsers, userState,
                                              window.empyreanNotifications, .follow-btn
                                              delegated handler, renderSuggestedUsers)

   PURPOSE
   ───────
   Adds a dedicated "Activity" section — reachable from its own
   sidebar entry — styled after the TikTok "New Followers" activity screen:
   avatar card, 4 media thumbnails, a source line ("From your contacts",
   "You may know X", "Just joined Empyrean"), and Follow / Remove buttons.

   Two panels, stacked:
     1. New Followers  — pulled straight from window.empyreanNotifications
        (type 'new_follower'), so it's the same real data the bell already
        has, just surfaced here too.
     2. Suggested Accounts — candidates drawn from window.mockUsers,
        excluding people already followed, the user themselves, and any
        suggestion the person has tapped "Remove" on (persisted so it
        doesn't reappear).

   INTEGRATION NOTES
   ──────────────────
   • Does not touch index.html, app-nav.js, or app-fixes.js. The sidebar
     nav item and content section are both built and injected by this file
     alone, and re-asserted via MutationObserver since app-nav.js's/
     app-fixes.js's buildSidebar() wipes and rebuilds `.sidebar-nav` from
     its own NAV array on every call — this file's link would otherwise be
     silently removed the next time that runs.
   • Reuses the EXISTING global `.follow-btn` delegated click handler in
     app-fixes.js (matches on `data-user-id`) instead of re-implementing
     follow/unfollow — so following someone here updates the exact same
     userState.followedUserIds / Firestore write everything else uses.
   • Media previews are read from whatever post data is already on the
     page for that author (dashboard/profile post cards), so nothing new
     needs to be fetched just for this panel; falls back to a colored
     initials tile when a user has no visible posts yet.

   PUBLIC API
   ──────────
   window.renderSuggestedContacts()
   window.openSuggestedContacts()   — navigates to the section directly
   ============================================================================= */

(function empyreanSuggestedContacts() {
    'use strict';

    if (window._empyreanSuggestedContactsLoaded) {
        console.warn('[SuggestedContacts] Already loaded — skipping duplicate.');
        return;
    }
    window._empyreanSuggestedContactsLoaded = true;

    var SECTION_ID  = 'suggested-for-you';
    var DISMISS_KEY = 'empyrean_dismissed_suggestions';
    var MAX_SUGGESTIONS = 12;
    var MAX_MEDIA = 4;

    function _S()       { return window.EmpState || {}; }
    function _us()       { return _S().userState || window.userState || {}; }
    function _mu()       { return _S().mockUsers  || window.mockUsers  || {}; }
    function _isGuest()  { var s = _S(); return s.isGuest != null ? !!s.isGuest : !!window.isGuest; }
    function _followedIds() {
        var f = _us().followedUserIds;
        if (f instanceof Set) return f;
        if (Array.isArray(f)) return new Set(f);
        return new Set();
    }
    function _esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _fallbackAvatar(name) {
        return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name || 'U') + '&background=1B2B8B&color=fff&size=120';
    }


    /* =========================================================================
       §1  CSS (injected once)
       ========================================================================= */
    (function injectCSS() {
        if (document.getElementById('_sc_css')) return;
        var s = document.createElement('style');
        s.id = '_sc_css';
        s.textContent = [
            '#'+SECTION_ID+' .sc-panel-title{font-size:1rem;font-weight:700;color:var(--primary);margin:0 0 4px;}',
            '#'+SECTION_ID+' .sc-panel-sub{font-size:0.8rem;color:var(--text-muted);margin:0 0 14px;}',
            '#'+SECTION_ID+' .sc-card{display:flex;flex-direction:column;padding:16px 4px;border-bottom:1px solid rgba(10,14,39,0.07);}',
            '#'+SECTION_ID+' .sc-card-top{display:flex;align-items:flex-start;gap:12px;}',
            '#'+SECTION_ID+' .sc-avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;flex-shrink:0;background:rgba(27,43,139,0.08);}',
            '#'+SECTION_ID+' .sc-info{flex:1;min-width:0;}',
            '#'+SECTION_ID+' .sc-name{font-size:0.95rem;font-weight:700;color:var(--primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '#'+SECTION_ID+' .sc-username{font-size:0.8rem;color:var(--text-muted);}',
            '#'+SECTION_ID+' .sc-source{display:flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--text-muted);margin-top:4px;}',
            '#'+SECTION_ID+' .sc-actions{display:flex;flex-direction:column;gap:8px;flex-shrink:0;}',
            '#'+SECTION_ID+' .sc-actions button{white-space:nowrap;padding:7px 16px;border-radius:20px;font-size:0.82rem;font-weight:700;cursor:pointer;border:none;}',
            '#'+SECTION_ID+' .sc-actions .follow-btn{background:var(--secondary,#1B2B8B);color:#fff;}',
            '#'+SECTION_ID+' .sc-actions .follow-btn.followed{background:rgba(27,43,139,0.10);color:var(--secondary,#1B2B8B);}',
            '#'+SECTION_ID+' .sc-actions .sc-remove-btn{background:rgba(10,14,39,0.06);color:var(--text-muted);}',
            '#'+SECTION_ID+' .sc-media-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px;}',
            '#'+SECTION_ID+' .sc-media-tile{aspect-ratio:1/1;border-radius:8px;overflow:hidden;background:linear-gradient(135deg,#1B2B8B,#5B0EA6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1rem;position:relative;}',
            '#'+SECTION_ID+' .sc-media-tile img,#'+SECTION_ID+' .sc-media-tile video{width:100%;height:100%;object-fit:cover;display:block;}',
            '#'+SECTION_ID+' .sc-empty{text-align:center;padding:48px 20px;color:var(--text-muted);}',
            '#'+SECTION_ID+' .sc-follower-row{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid rgba(10,14,39,0.05);}',
            '#'+SECTION_ID+' .sc-follower-row img{width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;}',
            '#'+SECTION_ID+' .sc-follower-row .sc-fr-text{flex:1;font-size:0.85rem;color:var(--primary);}',
            '#'+SECTION_ID+' .sc-follower-row .sc-fr-time{font-size:0.72rem;color:var(--text-muted);}',
            '.sc-nav-badge{background:#EF4444;color:#fff;font-size:0.62rem;font-weight:700;min-width:16px;height:16px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;padding:0 4px;margin-left:6px;}',

            /* Tagged-post preview card — thumbnail + snippet, like tapping a
               mention on X takes you to the source post. Red accent so a
               "you were tagged" card stands out from ordinary list rows. */
            '#'+SECTION_ID+' .sc-tagged-card{display:flex;flex-direction:column;padding:12px 4px;border-bottom:1px solid rgba(10,14,39,0.05);cursor:pointer;border-radius:10px;transition:background 0.15s;}',
            '#'+SECTION_ID+' .sc-tagged-card:hover{background:rgba(239,68,68,0.05);}',
            '#'+SECTION_ID+' .sc-tagged-top{display:flex;align-items:center;gap:10px;}',
            '#'+SECTION_ID+' .sc-tagged-top img{width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;}',
            '#'+SECTION_ID+' .sc-tagged-text{flex:1;min-width:0;font-size:0.85rem;color:var(--primary);}',
            '#'+SECTION_ID+' .sc-tagged-time{font-size:0.72rem;color:var(--text-muted);flex-shrink:0;}',
            '#'+SECTION_ID+' .sc-tagged-postcard{display:flex;align-items:center;gap:10px;margin:8px 0 0 48px;padding:8px;background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.25);border-left:3px solid #EF4444;border-radius:12px;}',
            '#'+SECTION_ID+' .sc-tagged-thumb{width:48px;height:48px;border-radius:8px;object-fit:cover;flex-shrink:0;background:linear-gradient(135deg,#DC2626,#F87171);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.05rem;position:relative;}',
            '#'+SECTION_ID+' .sc-tagged-thumb-wrap{position:relative;flex-shrink:0;width:48px;height:48px;}',
            '#'+SECTION_ID+' .sc-tagged-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.1rem;text-shadow:0 1px 4px rgba(0,0,0,0.6);pointer-events:none;}',
            '#'+SECTION_ID+' .sc-tagged-snippet{flex:1;min-width:0;font-size:0.8rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
            '#'+SECTION_ID+' .sc-tagged-viewlink{font-size:0.72rem;font-weight:700;color:#DC2626;flex-shrink:0;white-space:nowrap;}',

            /* Header row (title + top-right Tags & Trending shortcut icon) */
            '#'+SECTION_ID+' .sc-header-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}',
            '#'+SECTION_ID+' .sc-header-row .sc-panel-title{margin-bottom:2px;}',
            '#'+SECTION_ID+' #sc-trend-shortcut-btn{flex-shrink:0;width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;position:relative;'
                + 'background:rgba(27,43,139,0.08);color:var(--secondary,#1B2B8B);font-size:1rem;display:flex;align-items:center;justify-content:center;margin-top:2px;}',
            '#'+SECTION_ID+' #sc-trend-shortcut-btn .sc-nav-badge{position:absolute;top:-4px;right:-4px;margin-left:0;}',

            /* Tab bar */
            '#'+SECTION_ID+' .sc-tabbar{display:flex;gap:6px;margin:14px 0 18px;border-bottom:1px solid rgba(10,14,39,0.08);}',
            '#'+SECTION_ID+' .sc-tab-btn{flex:1;padding:10px 4px;background:none;border:none;border-bottom:2px solid transparent;'
                + 'font-size:0.82rem;font-weight:700;color:var(--text-muted);cursor:pointer;}',
            '#'+SECTION_ID+' .sc-tab-btn.active{color:var(--secondary,#1B2B8B);border-bottom-color:var(--secondary,#1B2B8B);}',
            '#'+SECTION_ID+' .sc-tab-panel{display:none;}',
            '#'+SECTION_ID+' .sc-tab-panel.active{display:block;}',

            /* Tags & Trending rows */
            '#'+SECTION_ID+' .sc-tag-row{display:flex;align-items:center;justify-content:space-between;padding:10px 4px;border-bottom:1px solid rgba(10,14,39,0.06);cursor:pointer;}',
            '#'+SECTION_ID+' .sc-tag-row .sc-tag-rank{font-size:0.72rem;color:#aaa;}',
            '#'+SECTION_ID+' .sc-tag-row strong{display:block;font-size:0.9rem;color:var(--primary);}',
            '#'+SECTION_ID+' .sc-tag-row .sc-tag-count{font-size:0.75rem;color:#888;background:rgba(27,43,139,0.08);padding:2px 8px;border-radius:20px;flex-shrink:0;}',
        ].join('\n');
        (document.head || document.documentElement).appendChild(s);
    })();


    /* =========================================================================
       §2  Dismissal store
       ========================================================================= */
    function _dismissedSet() {
        try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')); }
        catch (e) { return new Set(); }
    }
    function _dismiss(uid) {
        var set = _dismissedSet();
        set.add(uid);
        try { localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
    }


    /* =========================================================================
       §3  Candidate sourcing
       ========================================================================= */

    /** Best-effort "why are we suggesting this person" line, using whatever
     *  signal is actually available on the record — never invents a fake
     *  mutual-contacts claim if there's nothing to back it up. */
    function _sourceLabel(u) {
        var us = _us();
        if (u.phone || u.phoneNumber) {
            return { icon: 'fa-address-book', text: 'From your contacts' };
        }
        var myFollowed = _followedIds();
        var theirFollowed = u.followedUserIds instanceof Set ? u.followedUserIds
            : (Array.isArray(u.followedUserIds) ? new Set(u.followedUserIds) : new Set());
        var mutualId = null;
        theirFollowed.forEach(function (id) { if (!mutualId && myFollowed.has(id)) mutualId = id; });
        if (mutualId) {
            var mu = _mu();
            var mutualName = (mu[mutualId] || {}).fullName || 'someone you follow';
            return { icon: 'fa-user-friends', text: 'You may know ' + mutualName };
        }
        var joined = u.createdAt || u.joinedAt;
        if (joined) {
            var days = (Date.now() - new Date(joined).getTime()) / 86400000;
            if (days >= 0 && days < 14) return { icon: 'fa-star', text: 'Just joined Empyrean' };
        }
        return { icon: 'fa-sparkles', text: 'Suggested for you' };
    }

    /** Pull up to MAX_MEDIA thumbnail URLs for a user from whatever post
     *  cards for them are already rendered in the DOM (dashboard feed,
     *  profile grid) — avoids a dedicated Firestore query just for
     *  preview thumbnails. Falls back to null (caller renders an
     *  initials tile instead). */
    function _mediaForUser(uid) {
        var urls = [];
        document.querySelectorAll(
            '.post-card[data-user-id="' + uid + '"] img, .post-card[data-author-id="' + uid + '"] img,' +
            '.property-card[data-seller-id="' + uid + '"] img'
        ).forEach(function (img) {
            if (urls.length >= MAX_MEDIA) return;
            var src = img.currentSrc || img.src;
            if (src && urls.indexOf(src) === -1) urls.push(src);
        });
        return urls;
    }

    function _candidateUsers() {
        var us = _us();
        var mu = _mu();
        var followed = _followedIds();
        var dismissed = _dismissedSet();

        return Object.keys(mu)
            .map(function (uid) { return mu[uid]; })
            .filter(function (u) {
                return u && u.id && u.id !== us.id
                    && !followed.has(u.id)
                    && !dismissed.has(u.id);
            })
            .sort(function (a, b) { return (b.followerCount || 0) - (a.followerCount || 0); })
            .slice(0, MAX_SUGGESTIONS);
    }


    /* =========================================================================
       §4  Render
       ========================================================================= */
    function _renderFollowerCard(u) {
        var src = _sourceLabel(u);
        var media = _mediaForUser(u.id);
        var mediaHtml = '';
        if (media.length) {
            mediaHtml = '<div class="sc-media-grid">' + media.slice(0, MAX_MEDIA).map(function (url) {
                return '<div class="sc-media-tile"><img src="' + _esc(url) + '" alt="" loading="lazy"></div>';
            }).join('') + '</div>';
        }

        var card = document.createElement('div');
        card.className = 'sc-card';
        card.dataset.userId = u.id;
        card.innerHTML =
            '<div class="sc-card-top">'
            + '<img class="sc-avatar" src="' + _esc(u.avatar || _fallbackAvatar(u.fullName)) + '" alt=""'
            + ' onerror="this.onerror=null;this.src=\'' + _fallbackAvatar(u.fullName) + '\'">'
            + '<div class="sc-info">'
            + '<div class="sc-name">' + _esc(u.fullName || 'User') + '</div>'
            + '<div class="sc-username">@' + _esc(u.username || '') + '</div>'
            + '<div class="sc-source"><i class="fas ' + src.icon + '"></i> ' + _esc(src.text) + '</div>'
            + '</div>'
            + '<div class="sc-actions">'
            + '<button type="button" class="follow-btn" data-user-id="' + _esc(u.id) + '"><i class="fas fa-plus"></i> Follow</button>'
            + '<button type="button" class="sc-remove-btn" data-user-id="' + _esc(u.id) + '">Remove</button>'
            + '</div>'
            + '</div>'
            + mediaHtml;
        return card;
    }

    function _renderNewFollowerRow(n) {
        var mu = _mu();
        var actor = n.userId ? mu[n.userId] : null;
        var row = document.createElement('div');
        row.className = 'sc-follower-row';
        row.innerHTML =
            '<img src="' + _esc((actor && actor.avatar) || _fallbackAvatar((actor && actor.fullName) || 'U')) + '" alt="">'
            + '<div class="sc-fr-text">' + _esc(n.message || 'New follower') + '</div>'
            + '<div class="sc-fr-time">' + _esc(window._timeAgo ? window._timeAgo(n.ts) : '') + '</div>';
        return row;
    }

    /* =========================================================================
       §4c  Tags & Trending — reuses app-fixes.js's TagEngine data
       (window.empyreanNotifications type 'mention' for "You've Been Tagged",
       window._trendingTags for "Trending Now") instead of standing up a
       second, parallel tag/mention system.
       ========================================================================= */
    /** Detect a video URL (by extension or Cloudinary's /video/upload/ path segment). */
    function _isVideoUrl(url) {
        return /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url || '') || /\/video\/upload\//i.test(url || '');
    }

    /**
     * Cloudinary serves an auto-generated poster frame for a video asset
     * when the same URL is requested with an image extension instead of
     * the video's own — swap it so a video thumbnail shows an actual
     * frame from the clip instead of a blank/broken image.
     */
    function _posterUrl(url) {
        if (!url || !_isVideoUrl(url)) return url;
        return url.replace(/\.(mp4|webm|mov|avi|mkv)(\?|$)/i, '.jpg$2');
    }

    function _renderTaggedRow(n) {
        var mu = _mu();
        var actor = n.fromUserId ? mu[n.fromUserId] : null;
        var row = document.createElement('div');
        row.className = 'sc-tagged-card';

        /* FIX (feature: thumbnail card for the tagged post, like tapping a
           mention on X): mention notifications now carry the originating
           post's text preview and, if it had media, a thumbnail URL (see
           app-tags.js's _notifyMentionedUser and app-fixes.js's Quick Post
           handler, which passes the uploaded media URL through). Render
           an actual preview card instead of a bare text line — a real
           image/video-frame thumbnail when the post had media, otherwise
           a text snippet. */
        var postCardHtml = '';
        if (n.preview || n.thumb) {
            var isVid = n.thumb && _isVideoUrl(n.thumb);
            var thumbHtml;
            if (n.thumb) {
                thumbHtml =
                    '<div class="sc-tagged-thumb-wrap">'
                    + '<img class="sc-tagged-thumb" src="' + _esc(_posterUrl(n.thumb)) + '" alt=""'
                    + ' onerror="this.parentElement.innerHTML=\'<div class=&quot;sc-tagged-thumb&quot;><i class=&quot;fas fa-file-alt&quot;></i></div>\'">'
                    + (isVid ? '<span class="sc-tagged-play"><i class="fas fa-play-circle"></i></span>' : '')
                    + '</div>';
            } else {
                thumbHtml = '<div class="sc-tagged-thumb"><i class="fas fa-file-alt"></i></div>';
            }
            postCardHtml =
                '<div class="sc-tagged-postcard">'
                + thumbHtml
                + '<div class="sc-tagged-snippet">' + _esc(n.preview || 'View the post') + '</div>'
                + '<span class="sc-tagged-viewlink">View →</span>'
                + '</div>';
        }

        row.innerHTML =
            '<div class="sc-tagged-top">'
            + '<img src="' + _esc((actor && actor.avatar) || _fallbackAvatar((actor && actor.fullName) || n.fromName || 'U')) + '" alt="">'
            + '<div class="sc-tagged-text">' + _esc(n.message || ((n.fromName || 'Someone') + ' tagged you')) + '</div>'
            + '<div class="sc-tagged-time">' + _esc(window._timeAgo ? window._timeAgo(n.createdAt || n.ts) : '') + '</div>'
            + '</div>'
            + postCardHtml;

        /* Tap-through to the actual post, like tapping a notification on X.
           Instant feedback on tap so a failed lookup (post scrolled out of
           the feed's recent window) is never a silent dead end — the
           person sees something happened even before openPostById's own
           "couldn't find it" toast would fire a few seconds later. */
        if (n.postId) {
            row.addEventListener('click', function () {
                if (typeof window.showNotification === 'function') {
                    window.showNotification('Opening post…', 'info');
                }
                if (typeof window.openPostById === 'function') {
                    window.openPostById(n.postId);
                } else if (typeof window.showNotification === 'function') {
                    window.showNotification("Couldn't open that post right now.", 'error');
                }
            });
        } else {
            row.style.cursor = 'default';
        }
        return row;
    }

    function _renderTrendingRow(tag, score, rank) {
        var row = document.createElement('div');
        row.className = 'sc-tag-row';
        row.dataset.tag = tag;
        row.innerHTML =
            '<div><span class="sc-tag-rank">' + rank + ' · Trending</span><br><strong>#' + _esc(tag) + '</strong></div>'
            + '<span class="sc-tag-count">' + score + ' post' + (score !== 1 ? 's' : '') + '</span>';
        row.addEventListener('click', function () {
            if (typeof window._incrementTag === 'function') window._incrementTag(tag);
            var hashLink = document.querySelector('.hashtag-tag[data-tag="' + tag + '"]');
            if (hashLink) hashLink.click();
        });
        return row;
    }

    function _renderTagsAndTrending() {
        var section = document.getElementById(SECTION_ID);
        if (!section) return;
        var taggedWrap = section.querySelector('#sc-tagged-list');
        var trendWrap  = section.querySelector('#sc-trending-list');
        if (!taggedWrap || !trendWrap) return;

        /* ── You've Been Tagged (mention notifications) ── */
        var tagged = (window.empyreanNotifications || [])
            .filter(function (n) { return n.type === 'mention'; })
            .slice(0, 12);
        taggedWrap.innerHTML = '';
        if (tagged.length) {
            tagged.forEach(function (n) { taggedWrap.appendChild(_renderTaggedRow(n)); });
        } else {
            var emptyT = document.createElement('div');
            emptyT.className = 'sc-empty';
            emptyT.style.padding = '16px 0';
            emptyT.textContent = "No tags yet — posts that mention you will show up here.";
            taggedWrap.appendChild(emptyT);
        }

        /* ── Trending Now (hashtags) ── */
        var sorted = Object.entries(window._trendingTags || {})
            .sort(function (a, b) { return b[1] - a[1]; })
            .slice(0, 10);
        trendWrap.innerHTML = '';
        if (sorted.length) {
            sorted.forEach(function (entry, i) { trendWrap.appendChild(_renderTrendingRow(entry[0], entry[1], i + 1)); });
        } else {
            var emptyR = document.createElement('div');
            emptyR.className = 'sc-empty';
            emptyR.style.padding = '16px 0';
            emptyR.textContent = 'No trending tags yet.';
            trendWrap.appendChild(emptyR);
        }

        var shortcutBadge = document.getElementById('sc-trend-shortcut-badge');
        if (shortcutBadge) {
            var total = tagged.length;
            if (total > 0) { shortcutBadge.textContent = total > 9 ? '9+' : String(total); shortcutBadge.style.display = 'inline-flex'; }
            else { shortcutBadge.style.display = 'none'; }
        }
    }

    function renderSuggestedContacts() {
        var section = document.getElementById(SECTION_ID);
        if (!section || _isGuest()) return;

        var followersWrap = section.querySelector('#sc-followers-list');
        var suggestWrap   = section.querySelector('#sc-suggest-list');
        if (!followersWrap || !suggestWrap) return;

        /* ── New Followers (real notification data) ── */
        var followerNotifs = (window.empyreanNotifications || [])
            .filter(function (n) { return n.type === 'new_follower'; })
            .slice(0, 8);
        followersWrap.innerHTML = '';
        if (followerNotifs.length) {
            followerNotifs.forEach(function (n) { followersWrap.appendChild(_renderNewFollowerRow(n)); });
        } else {
            var emptyF = document.createElement('div');
            emptyF.className = 'sc-empty';
            emptyF.style.padding = '16px 0';
            emptyF.textContent = 'No new followers yet.';
            followersWrap.appendChild(emptyF);
        }

        /* ── Suggested Accounts ── */
        var candidates = _candidateUsers();
        suggestWrap.innerHTML = '';
        if (!candidates.length) {
            var emptyS = document.createElement('div');
            emptyS.className = 'sc-empty';
            emptyS.innerHTML = '<i class="fas fa-user-plus" style="font-size:2rem;display:block;margin-bottom:12px;opacity:0.3;"></i>No new suggestions right now.';
            suggestWrap.appendChild(emptyS);
        } else {
            candidates.forEach(function (u) { suggestWrap.appendChild(_renderFollowerCard(u)); });
        }

        _updateNavBadge(candidates.length);
        _renderTagsAndTrending();
    }
    window.renderSuggestedContacts = renderSuggestedContacts;


    /* =========================================================================
       §5  Section + sidebar link injection
       ========================================================================= */
    function _ensureSection() {
        if (document.getElementById(SECTION_ID)) return;
        var main = document.querySelector('.main-content');
        if (!main) return;

        var section = document.createElement('section');
        section.id = SECTION_ID;
        section.className = 'content-section';
        section.innerHTML =
            '<div style="max-width:520px;margin:0 auto;padding:20px 16px 60px;">'
            + '<div class="sc-header-row">'
            + '<div><h2 class="sc-panel-title" style="font-size:1.3rem;"><i class="fas fa-user-plus" style="color:var(--secondary,#1B2B8B);margin-right:8px;"></i>Activity</h2>'
            + '<p class="sc-panel-sub" style="margin-bottom:0;">Recent followers and accounts worth following.</p></div>'
            + '<button type="button" id="sc-trend-shortcut-btn" title="Tags &amp; Trending"><i class="fas fa-hashtag"></i>'
            + '<span class="sc-nav-badge" id="sc-trend-shortcut-badge" style="display:none;"></span></button>'
            + '</div>'

            + '<div class="sc-tabbar">'
            + '<button type="button" class="sc-tab-btn active" data-sc-tab="followers">New Followers</button>'
            + '<button type="button" class="sc-tab-btn" data-sc-tab="suggested">Suggested Accounts</button>'
            + '<button type="button" class="sc-tab-btn" data-sc-tab="trending">Tags &amp; Trending</button>'
            + '</div>'

            + '<div class="sc-tab-panel active" data-sc-panel="followers"><div id="sc-followers-list"></div></div>'

            + '<div class="sc-tab-panel" data-sc-panel="suggested"><div id="sc-suggest-list"></div></div>'

            + '<div class="sc-tab-panel" data-sc-panel="trending">'
            + '<h3 class="sc-panel-title">You\'ve Been Tagged</h3>'
            + '<div id="sc-tagged-list"></div>'
            + '<h3 class="sc-panel-title" style="margin-top:22px;">Trending Now</h3>'
            + '<div id="sc-trending-list"></div>'
            + '</div>'
            + '</div>';
        main.appendChild(section);
    }

    /* =========================================================================
       §4b  Tab switching
       ========================================================================= */
    function _switchTab(tabKey) {
        var section = document.getElementById(SECTION_ID);
        if (!section) return;
        section.querySelectorAll('.sc-tab-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.scTab === tabKey);
        });
        section.querySelectorAll('.sc-tab-panel').forEach(function (p) {
            p.classList.toggle('active', p.dataset.scPanel === tabKey);
        });
    }

    function _ensureNavLink() {
        var ul = document.querySelector('.sidebar-nav');
        if (!ul || _isGuest()) return;
        if (ul.querySelector('.nav-link[data-target="' + SECTION_ID + '"]')) return;

        var li = document.createElement('li');
        var a  = document.createElement('a');
        a.href = '#';
        a.className = 'nav-link';
        a.dataset.target  = SECTION_ID;
        a.dataset.section = SECTION_ID;
        a.setAttribute('aria-label', 'Activity');
        a.innerHTML =
            '<span class="nav-icon-box"><i class="fas fa-user-plus"></i></span>'
            + '<span style="flex:1;letter-spacing:0.01em;">Activity</span>'
            + '<span class="sc-nav-badge" id="sc-nav-badge" style="display:none;"></span>';
        a.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openSuggestedContacts();
        });
        li.appendChild(a);
        ul.appendChild(li);
    }

    function _updateNavBadge(count) {
        var badge = document.getElementById('sc-nav-badge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    function openSuggestedContacts(tabKey) {
        if (_isGuest()) { if (typeof window.openAuthModal === 'function') window.openAuthModal('login'); return; }
        _ensureSection();
        renderSuggestedContacts();
        if (tabKey) _switchTab(tabKey);
        if (typeof window.navigateTo === 'function') window.navigateTo(SECTION_ID, true);
    }
    window.openSuggestedContacts = openSuggestedContacts;


    /* =========================================================================
       §6  Event delegation — Remove button + keep the section fresh after a
           follow (the global .follow-btn handler in app-fixes.js already
           does the actual follow/unfollow; this just re-renders our list so
           a newly-followed person drops out of "Suggested Accounts").
       ========================================================================= */
    document.addEventListener('click', function (e) {
        var tabBtn = e.target.closest && e.target.closest('#' + SECTION_ID + ' .sc-tab-btn');
        if (tabBtn) {
            e.preventDefault();
            _switchTab(tabBtn.dataset.scTab);
            return;
        }

        var shortcutBtn = e.target.closest && e.target.closest('#sc-trend-shortcut-btn');
        if (shortcutBtn) {
            e.preventDefault();
            openSuggestedContacts('trending');
            return;
        }

        var removeBtn = e.target.closest && e.target.closest('#' + SECTION_ID + ' .sc-remove-btn');
        if (removeBtn) {
            e.preventDefault();
            var uid = removeBtn.dataset.userId;
            if (uid) _dismiss(uid);
            var card = removeBtn.closest('.sc-card');
            if (card) { card.style.opacity = '0'; setTimeout(function () { card.remove(); }, 200); }
            return;
        }

        var followBtn = e.target.closest && e.target.closest('#' + SECTION_ID + ' .follow-btn');
        if (followBtn) {
            /* Let app-fixes.js's global handler run first (it's on the same
               document click phase and registered earlier at load time),
               then refresh our own list a tick later. */
            setTimeout(renderSuggestedContacts, 150);
        }
    });

    /* Keep the sidebar link alive across buildSidebar() rebuilds, which
       wipe and repopulate `.sidebar-nav` from app-nav.js's/app-fixes.js's
       own NAV array and know nothing about this file's entry. */
    function _watchSidebar() {
        var ul = document.querySelector('.sidebar-nav');
        if (!ul || ul._scWatched) return;
        ul._scWatched = true;
        new MutationObserver(function () { _ensureNavLink(); }).observe(ul, { childList: true });
    }


    /* =========================================================================
       §7  Bootstrap
       ========================================================================= */
    function _boot() {
        if (_isGuest()) return;
        _ensureSection();
        _ensureNavLink();
        _watchSidebar();
        renderSuggestedContacts();
    }

    document.addEventListener('empyrean-init-done', function () { setTimeout(_boot, 700); });
    document.addEventListener('empyrean-user-ready', function () { setTimeout(_boot, 400); });
    document.addEventListener('empyrean-section-change', function (ev) {
        if (ev && ev.detail && ev.detail.section === SECTION_ID) {
            setTimeout(renderSuggestedContacts, 50);
        }
    });
    /* Refresh periodically so new followers / newly-joined users surface
       without requiring a manual reload. */
    setInterval(function () { if (document.getElementById(SECTION_ID)) renderSuggestedContacts(); }, 30000);

    console.log('[SuggestedContacts] ✅ "Activity" sidebar section ready.');

})();