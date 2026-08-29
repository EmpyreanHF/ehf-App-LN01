/* =============================================================================
   EMPYREAN INTERNATIONAL — SOCIAL FEED
   app-feed.js  |  Step 0.8  |  Refactor Roadmap v1.0
   =============================================================================

   PURPOSE
   ───────
   Complete social feed system extracted from app-fixes.js.  Covers:

     • Post card builder — createNewPostElement()
     • SOS feed card — createSosPostOnFeed()
     • Crisis feed card — createCrisisPostOnFeed()
     • All 8 real-time Firestore onSnapshot listeners — _startRealtimeListeners()
         posts | news | marketplace | reels | sos_queue | crisis_reports
         announcements | users
     • Dashboard news slider — renderDashboardNews()
     • Suggested users widget — renderSuggestedUsers()
     • Profile gallery URL accumulator — _addUrlsToProfileGallery()
     • Reel viewer — setupReelViewerObserver() + openReelViewer()
     • View-count IntersectionObserver setup

   LOAD ORDER
   ──────────
   ... all prior modules (state, helpers, contracts, notifications, tags,
       dom, auth) must be loaded before this file.
   <script src="app-feed.js">

   DEPENDS ON
   ──────────
   • window.fbDb / window._firebaseLoaded (firebase-init.js)
   • window.EmpState / window.userState / window.isGuest / window.isAdmin
   • window.formatWhatsAppText   (app-helpers.js)
   • window.handleYoutubeEmbed   (app-tags.js)
   • window.showNotification     (app-helpers.js)
   • window.pushNotification     (app-notifications.js)
   • window._processPostTags     (app-tags.js)
   • window.renderUserProfile    (app-profile.js)
   • window.navigateTo           (app-dom.js)
   • window.createSosPostOnFeed  — defined here, used by sos listener
   • window.createCrisisPostOnFeed — defined here, used by crisis listener
   • window._scheduleListenerRetry (app-auth.js)

   PUBLIC API
   ──────────
   window.createNewPostElement(text, mediaFiles, authorData, isBusinessPost, retweetData)
   window.createSosPostOnFeed(sosData)
   window.createCrisisPostOnFeed(crisisData)
   window._startRealtimeListeners()
   window.renderDashboardNews()
   window.renderSuggestedUsers()
   window._addUrlsToProfileGallery(urls)
   window.setupReelViewerObserver()
   window.openReelViewer(clickedCard)

   SECTION MAP
   ───────────
   §1  Post card builder — createNewPostElement
   §2  SOS post card — createSosPostOnFeed
   §3  Crisis report card — createCrisisPostOnFeed
   §4  Realtime listeners — _startRealtimeListeners (8 collections)
   §5  Dashboard news slider — renderDashboardNews
   §6  Suggested users widget — renderSuggestedUsers
   §7  Profile gallery helper — _addUrlsToProfileGallery
   §8  Reel viewer — setupReelViewerObserver + openReelViewer
   §9  View-count observer

   ============================================================================= */

(function empyreanFeedModule() {
    'use strict';

    if (window._empyreanFeedLoaded) {
        console.warn('[EmpFeed] Already loaded — skipping duplicate.');
        return;
    }
    window._empyreanFeedLoaded = true;

    /* Shorthand state accessors */
    function _S()       { return window.EmpState || {}; }
    function _us()      { return _S().userState  || window.userState  || {}; }
    function _isGuest() { var s=_S(); return s.isGuest != null ? s.isGuest : window.isGuest; }
    function _isAdmin() { var s=_S(); return s.isAdmin != null ? s.isAdmin : window.isAdmin; }

    /* ── CSS — comment-section bottom sheet (was unstyled inline block) ── */
    (function _commentSheetCss() {
        if (document.getElementById('_feed_comment_sheet_style')) return;
        var s = document.createElement('style');
        s.id = '_feed_comment_sheet_style';
        s.textContent = [
            /* Backdrop, click-to-dismiss */
            '.comment-sheet-backdrop { position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9499;display:none; }',
            '.comment-sheet-backdrop.open { display:block; }',
            /* Bottom sheet itself — fixed to viewport, grows up to 50vh and stops */
            '.comment-section { position:fixed;left:0;right:0;bottom:0;top:auto;background:#fff;border-radius:18px 18px 0 0;max-height:50vh;min-height:0;display:flex !important;flex-direction:column;transform:translateY(100%);transition:transform 0.28s ease;z-index:9500;box-shadow:0 -4px 28px rgba(10,14,39,0.18); }',
            '.comment-section.open { transform:translateY(0); }',
            /* Header: title + close (X) button */
            '.comment-sheet-header { display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(10,14,39,0.08);flex-shrink:0; }',
            '.comment-sheet-header .comment-sheet-title { font-weight:700;font-size:0.98rem;color:var(--primary);font-family:inherit; }',
            '.comment-sheet-close-btn { background:rgba(10,14,39,0.06);border:none;cursor:pointer;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:0.95rem;flex-shrink:0; }',
            '.comment-sheet-close-btn:active { background:rgba(10,14,39,0.12); }',
            /* Scrollable list, grows then scrolls once content exceeds the 50vh cap */
            '.comment-list { flex:1;overflow-y:auto;padding:12px 16px;scrollbar-width:thin; }',
            '.comment-list p { color:var(--text-muted); }',
            /* Input row pinned to the bottom of the sheet.
               Scoped to .comment-section > .comment-form (the top-level form)
               so nested ._inline_reply_form replies — which share the
               .comment-form class but live inside a comment thread, not the
               sheet shell — are not forced into this fixed bottom-row layout. */
            '.comment-section > .comment-form { display:flex !important;gap:10px;align-items:center;padding:10px 16px;border-top:1px solid rgba(10,14,39,0.08);flex-shrink:0;background:#fff;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px)); }',
            '.comment-section > .comment-form input[name="comment-text"] { flex:1;border:1px solid rgba(10,14,39,0.15);border-radius:50px;padding:9px 14px;font-size:0.88rem;outline:none;color:var(--primary); }',
            '.comment-section > .comment-form button[type="submit"] { background:var(--secondary);border:none;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0; }',
            '.comment-section > .comment-form button[type="submit"] svg { stroke:#fff; }',
        ].join('\n');
        document.head.appendChild(s);
        /* Single shared backdrop element, reused by every post card's sheet */
        if (!document.querySelector('.comment-sheet-backdrop')) {
            var bd = document.createElement('div');
            bd.className = 'comment-sheet-backdrop';
            document.body.appendChild(bd);
        }
    })();


    /* =========================================================================
       §1  POST CARD BUILDER
       ========================================================================= */

    /**
     * Build and return a fully-rendered .impact-story <div> element.
     * Does NOT insert it into the DOM — caller is responsible for placement.
     *
     * @param {string}      text            — Raw post text (markdown + @mention + #tag)
     * @param {Array}       mediaFiles      — File objects or { _cloudUrl, url, type } objects
     * @param {Object|null} authorData      — { id, fullName, avatar, businessPage? }
     *                                        Defaults to current userState
     * @param {boolean}     isBusinessPost  — If true, uses business page avatar/name
     * @param {Object|null} retweetData     — { retweeterName } if this is a retweet
     * @returns {HTMLElement}
     */
    function createNewPostElement(text, mediaFiles, authorData, isBusinessPost, retweetData) {
        isBusinessPost = isBusinessPost || false;
        retweetData    = retweetData    || null;

        const us     = _us();
        const author = authorData || us;

        const avatar = isBusinessPost
            ? (author.businessPage ? author.businessPage.profilePhoto
                : 'https://ui-avatars.com/api/?name=Business&background=5B0EA6&color=fff&size=150')
            : (author.avatar || author.logo
                || ('https://ui-avatars.com/api/?name='
                    + encodeURIComponent(author.fullName || 'U')
                    + '&background=5B0EA6&color=fff&size=150'));

        const name   = isBusinessPost
            ? (author.businessPage ? author.businessPage.name : 'Business Page')
            : (author.fullName || author.name || 'User');

        /* ── Text processing ── */
        const preprocessed = (text || '')
            .replace(/==(.*?)==/g,
                '<mark style="background:rgba(245,197,24,0.3);padding:1px 4px;border-radius:3px;">$1</mark>')
            .replace(/__(.*?)__/g, '<u>$1</u>');

        const ytResult = (typeof window.handleYoutubeEmbed === 'function')
            ? window.handleYoutubeEmbed(preprocessed)
            : { html: '<p>' + (typeof window.formatWhatsAppText === 'function'
                ? window.formatWhatsAppText(preprocessed) : preprocessed) + '</p>', found: false };

        const formattedText = ytResult.html;
        const youtubeFound  = ytResult.found;

        /* ── Read-more truncation ──
           REWORKED: this used to hand-cut the HTML at ~280 characters, which
           is a poor proxy for "how many lines does this actually take up"
           (depends on font size, container width, wrapping, emoji, etc.) and
           only worked for posts built through this exact function -- so
           other post types silently got no truncation at all.
           Truncation is now handled globally in app-fixes.js: a single
           MutationObserver watches for ANY ".story-content"/".news-item-content"
           landing in the DOM (regardless of which renderer built it),
           measures the ACTUAL rendered line count of the text, and only
           then adds the chevron toggle -- so every post gets consistent,
           accurate "after 10 lines" behaviour with one shared implementation.
           This function is kept as a passthrough so the call site below
           doesn't need to change. */
        function _withReadMore(html) {
            return html;
        }


        /* ── Media HTML ── */
        let mediaHTML = '';
        if (mediaFiles && mediaFiles.length > 0) {
            const mc = mediaFiles.length;
            const ml = mc === 1 ? 'solo' : mc === 2 ? 'duo' : mc === 3 ? 'trio' : 'grid';
            mediaHTML = '<div class="story-media-container" data-count="' + mc + '" data-layout="' + ml + '">';
            mediaFiles.forEach(function (file, mi) {
                let url, mimeType, isFreshLocalPreview = false;
                if (typeof file === 'string') {
                    url = file;
                    mimeType = (/\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(file) || /\/video\/upload\//i.test(file))
                        ? 'video/' : 'image/';
                } else if (file && file._cloudUrl) {
                    url = file._cloudUrl; mimeType = file.type || '';
                } else if (file && file.url) {
                    url = file.url; mimeType = file.type || '';
                } else if (file instanceof File) {
                    url = URL.createObjectURL(file); mimeType = file.type || '';
                    isFreshLocalPreview = true;
                } else { return; }
                // BUGFIX: a blob: URL freshly minted above from a real File
                // object (isFreshLocalPreview) is exactly the instant local
                // preview this function is supposed to show -- it used to be
                // discarded by this same guard, so "immediate preview while
                // uploading" never actually rendered anything. We still
                // reject blob: strings that arrive as already-stored data
                // (e.g. loaded back from Firestore/localStorage), since those
                // reference a browser session that's gone and would 404.
                if (!url || (url.startsWith('blob:') && !isFreshLocalPreview)) return;

                const isVid = mimeType.startsWith('video/')
                    || /\/video\/upload\//i.test(url)
                    || /\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(url);

                mediaHTML += '<div class="story-media-item" data-index="' + mi + '">';
                if (isVid) {
                    mediaHTML += '<video src="' + url + '" class="story-video" controls preload="metadata"'
                        + ' loading="lazy" playsinline onerror="this.closest(\'.story-media-item\').style.display=\'none\'"></video>';
                } else {
                    mediaHTML += '<img src="' + url + '" class="story-main-image" alt="Post media"'
                        + ' loading="lazy" onerror="this.closest(\'.story-media-item\').style.display=\'none\'">';
                }
                mediaHTML += '</div>';
            });
            mediaHTML += '</div>';
        }

        /* ── Retweet / Quote embed header & card ── */
        const isQuotePost = retweetData && retweetData.isQuote;
        const isRetweetPost = retweetData && !retweetData.isQuote;

        const retweetHeaderHTML = isRetweetPost
            ? '<div class="retweet-header" style="display:flex;align-items:center;gap:7px;'
                + 'padding:8px 16px 0;font-size:0.80rem;font-weight:700;color:#1B2B8B;'
                + 'border-bottom:none;">'
                + '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#1B2B8B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> '
                + _esc(retweetData.retweeterName || name) + ' Retweeted</div>'
            : '';

        /* Build the quoted-post embed block for quote posts */
        let quoteEmbedHTML = '';
        if (isQuotePost && retweetData.originalPost) {
            const op = retweetData.originalPost;
            const opName   = _esc(op.authorName   || op.name   || 'Original Author');
            const opAvatar = op.authorAvatar || op.avatar || '';
            const opText   = _esc((op.text || op.content || '').substring(0, 200));
            const opMedia  = op.media || op.mediaUrls || op.mediaFiles || [];
            const firstMedia = Array.isArray(opMedia) ? opMedia[0] : (typeof opMedia === 'string' ? opMedia : '');
            const firstMediaUrl = (typeof firstMedia === 'object' && firstMedia)
                ? (firstMedia._cloudUrl || firstMedia.url || '') : (firstMedia || '');
            const isVidEmbed = firstMediaUrl && (
                /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(firstMediaUrl) ||
                /\/video\/upload\//i.test(firstMediaUrl)
            );

            let embedMediaHTML = '';
            if (firstMediaUrl && !firstMediaUrl.startsWith('blob:')) {
                if (isVidEmbed) {
                    embedMediaHTML = '<video src="' + firstMediaUrl + '" class="vf-quote-embed-img"'
                        + ' style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;display:block;"'
                        + ' muted playsinline preload="metadata"'
                        + ' onerror="this.style.display=\'none\'"></video>';
                } else {
                    embedMediaHTML = '<img src="' + firstMediaUrl + '" class="vf-quote-embed-img"'
                        + ' style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;display:block;"'
                        + ' loading="lazy" onerror="this.style.display=\'none\'">';
                }
            }

            quoteEmbedHTML =
                '<div class="vf-quote-card-embed" style="margin:6px 14px 10px;border:1.5px solid rgba(27,43,139,0.18);'
                + 'border-radius:14px;overflow:hidden;background:rgba(27,43,139,0.03);">'
                /* Embed media */
                + (embedMediaHTML
                    ? '<div style="overflow:hidden;max-height:120px;">' + embedMediaHTML + '</div>'
                    : '')
                /* Embed header */
                + '<div style="display:flex;align-items:center;gap:7px;padding:9px 12px 6px;">'
                + (opAvatar
                    ? '<img src="' + _attr(opAvatar) + '" style="width:26px;height:26px;border-radius:50%;'
                      + 'object-fit:cover;flex-shrink:0;border:1.5px solid rgba(27,43,139,0.15);"'
                      + ' onerror="this.style.display=\'none\'">'
                    : '<div style="width:26px;height:26px;border-radius:50%;background:rgba(27,43,139,0.15);flex-shrink:0;'
                      + 'display:flex;align-items:center;justify-content:center;">'
                      + '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#1B2B8B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>')
                + '<span style="font-size:0.75rem;font-weight:800;color:#0A0E27;white-space:nowrap;'
                + 'overflow:hidden;text-overflow:ellipsis;">' + opName + '</span>'
                + '<span style="margin-left:auto;font-size:0.62rem;background:rgba(27,43,139,0.1);'
                + 'color:#1B2B8B;font-weight:700;padding:2px 8px;border-radius:20px;flex-shrink:0;">'
                + '<svg viewBox="0 0 24 24" width="10" height="10" fill="#1B2B8B"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>Original</span>'
                + '</div>'
                /* Embed text */
                + (opText
                    ? '<div style="padding:0 12px 10px;font-size:0.78rem;color:#374151;line-height:1.45;'
                      + 'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">'
                      + opText + '</div>'
                    : '')
                + '</div>';
        }

        const postId = 'post-' + Date.now();
        const ts = new Date().toLocaleString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const showOpts = (author.id === us.id || _isAdmin()) ? 'block' : 'none';

        const el = document.createElement('div');
        el.className     = 'impact-story';
        el.dataset.postId = postId;
        el.dataset.userId = author.id;
        if (isRetweetPost) el.dataset.isRetweet = '1';
        if (isQuotePost)   el.dataset.isQuote   = '1';
        el.innerHTML =
            retweetHeaderHTML
            + '<div class="story-header">'
            + '<div class="avatar-placeholder square" style="' + (isBusinessPost ? 'border-radius:8px;' : '') + '">'
            + '<img src="' + _attr(avatar) + '" alt="' + _attr(name) + '" loading="lazy"'
            + ' onerror="this.onerror=null;this.src=\'https://ui-avatars.com/api/?name=' + encodeURIComponent(name || 'U') + '&background=5B0EA6&color=fff&size=150\';"></div>'
            + '<div class="story-user-info"><strong>' + _esc(name) + '</strong><span>' + ts + '</span></div>'
            + '<div class="post-options" style="display:' + showOpts + ';">'
            + '<button class="options-btn"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>'
            + '<div class="options-menu">'
            + '<a href="#" class="edit-post-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</a>'
            + '<a href="#" class="delete-post-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg> Delete</a>'
            + '<a href="#" class="promote-post-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg> Promote</a>'
            + '</div></div></div>'
            + '<div class="story-content">' + _withReadMore(formattedText) + '</div>'
            /* Quote embed (shown below the quoter's own text) */
            + quoteEmbedHTML
            /* BUGFIX: media moved from above .story-content to below it (and
               below the quote embed) so every post reads header -> text ->
               media -> actions, instead of media appearing before the
               caption/announcement copy. */
            + (!youtubeFound ? mediaHTML : '')
            + '<div class="story-actions">'
            + '<a class="action-btn comment-btn" data-action="comment" title="Reply"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z"/></svg><span class="comment-count x-count"></span></span></a>'
            + '<a class="action-btn retweet-btn" data-action="retweet" title="Repost"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.932 9.48.568 8.02 5 3.88zM19.5 20.12l-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2H11V4h5.5c2.209 0 4 1.79 4 4v8.45l1.568-1.93 1.364 1.46-4.432 4.14z"/></svg><span class="retweet-count x-count"></span></span></a>'
            + '<a class="action-btn like-btn" data-action="like" title="Like"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z"/></svg><span class="like-count x-count"></span></span></a>'
            + '<a class="action-btn quote-btn" data-action="quote" title="Quote"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z"/><path d="M9 10.5c0-.28-.22-.5-.5-.5s-.5.22-.5.5.22.5.5.5.5-.22.5-.5zm3.5 0c0-.28-.22-.5-.5-.5s-.5.22-.5.5.22.5.5.5.5-.22.5-.5zm3.5 0c0-.28-.22-.5-.5-.5s-.5.22-.5.5.22.5.5.5.5-.22.5-.5z" fill="currentColor" stroke="none"/></svg><span class="quote-count x-count"></span></span></a>'
            + '<span class="action-btn view-count-display" title="Views"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><span class="view-count x-count"></span></span>'
            + '<a class="action-btn bookmark-btn" data-action="bookmark" title="Bookmark" style="margin-left:auto;"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l.5 1v16.5l-6-3.5-6 3.5V4l.5-1z"/></svg></span></a>'
            + '<a class="action-btn share-btn" data-action="share" title="Share"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg><span class="share-count x-count"></span></span></a>'
            + '<a class="action-btn download-media-btn" data-action="download" title="Download"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><rect x="4" y="18.4" width="16" height="2.2" rx="1.1" fill="currentColor" stroke="none"/></svg><span class="download-count x-count"></span></span></a>'
            + '</div>'
            + '<div class="comment-section">'
            + '<div class="comment-sheet-header"><span class="comment-sheet-title">Comments</span><button type="button" class="comment-sheet-close-btn" aria-label="Close comments"><i class="fas fa-times"></i></button></div>'
            + '<div class="comment-list"></div>'
            + '<form class="comment-form" novalidate>'
            + '<input type="text" name="comment-text" placeholder="Add a comment..." required>'
            + '<button type="submit"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>'
            + '</form></div>';

        return el;
    }
    window.createNewPostElement = createNewPostElement;


    /* =========================================================================
       §2  SOS POST CARD
       ========================================================================= */

    /* ── Amount-needed badge — single shared source ───────────────────────────
       Canonical, premium badge for the SOS "amount needed" panel. This is the
       ONLY place this component is defined — app-sos.js used to keep its own
       copy (_buildSosGoalBadgeHTML / .sos-goal-badge, red theme) which has
       been removed in favour of calling window.buildSosAmountBadgeHTML() here,
       so both files render an identical badge and there is only one place to
       update going forward. Self-contained <style> injection (no index.html /
       style.css edit needed) so it can't collide with any other stylesheet
       section — same pattern app-sos.js originally used.
       Theme: Royal Blue & Gold, matching the app's own brand tokens
       (--color-royal / --color-navy / --color-gold in tokens.css) rather than
       an unrelated palette. */
    function _injectSosAmountBadgeStyles() {
        if (document.getElementById('sos-amount-badge-styles')) return;
        const s = document.createElement('style');
        s.id = 'sos-amount-badge-styles';
        s.textContent =
            '.sos-goal-badge{display:flex;align-items:center;gap:14px;margin-top:10px;' +
            'padding:14px 18px;border-radius:20px;position:relative;overflow:hidden;' +
            'background:linear-gradient(135deg,rgba(27,43,139,0.07),rgba(139,92,246,0.07));' +
            'border:1px solid rgba(139,92,246,0.22);box-shadow:0 6px 20px rgba(10,14,39,0.10);' +
            'transition:box-shadow 0.25s ease,transform 0.25s ease;}' +
            '.sos-goal-badge:hover{box-shadow:0 10px 28px rgba(10,14,39,0.14);transform:translateY(-1px);}' +
            '.sos-goal-badge::before{content:"";position:absolute;top:0;left:0;width:4px;height:100%;' +
            'background:linear-gradient(180deg,#1B2B8B,#8B5CF6);}' +
            '.sos-goal-badge-watermark{position:absolute;top:-16px;right:-12px;width:86px;height:86px;' +
            'color:rgba(139,92,246,0.10);pointer-events:none;}' +
            '.sos-goal-badge-watermark svg{width:100%;height:100%;}' +
            '.sos-goal-badge-shimmer{position:absolute;top:0;left:-60%;width:45%;height:100%;' +
            'background:linear-gradient(120deg,transparent,rgba(139,92,246,0.24),transparent);' +
            'animation:sosGoalShimmer 3.4s ease-in-out infinite;pointer-events:none;}' +
            '@keyframes sosGoalShimmer{0%{left:-60%;}55%{left:120%;}100%{left:120%;}}' +
            '.sos-goal-badge-icon-wrap{position:relative;flex-shrink:0;width:44px;height:44px;' +
            'display:flex;align-items:center;justify-content:center;}' +
            '.sos-goal-badge-icon-ring{position:absolute;inset:-3px;border-radius:50%;' +
            'background:conic-gradient(from 0deg,#8B5CF6,#C4B5FD,#5B21B6,#8B5CF6);opacity:0.45;' +
            'animation:sosRingSpin 5s linear infinite;}' +
            '@keyframes sosRingSpin{to{transform:rotate(360deg);}}' +
            '.sos-goal-badge-icon{position:relative;z-index:1;flex-shrink:0;width:40px;height:40px;' +
            'border-radius:50%;background:linear-gradient(135deg,#1B2B8B,#0A0E27);display:flex;' +
            'align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(27,43,139,0.35);}' +
            '.sos-goal-badge-icon svg{width:18px;height:18px;stroke:#C4B5FD;transform-origin:center;' +
            'animation:sosHeartbeat 2.6s ease-in-out infinite;}' +
            '@keyframes sosHeartbeat{0%,100%{transform:scale(1);}15%{transform:scale(1.15);}' +
            '30%{transform:scale(1);}45%{transform:scale(1.1);}60%{transform:scale(1);}}' +
            '.sos-goal-badge-text{display:flex;flex-direction:column;line-height:1.28;min-width:0;position:relative;z-index:1;}' +
            '.sos-goal-badge-label{display:flex;align-items:center;gap:5px;font-size:0.66rem;font-weight:700;' +
            'letter-spacing:0.08em;text-transform:uppercase;color:#1B2B8B;opacity:0.85;' +
            'font-family:var(--font-sans,Inter,sans-serif);}' +
            '.sos-goal-badge-label-dot{width:5px;height:5px;border-radius:50%;background:#8B5CF6;' +
            'flex-shrink:0;box-shadow:0 0 6px rgba(139,92,246,0.8);}' +
            '.sos-goal-badge-amount{font-size:1.22rem;font-weight:800;color:#0A0E27;' +
            'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
            'font-family:var(--font-sans,Inter,sans-serif);}' +
            '.sos-goal-badge-amount .sos-goal-badge-currency{display:inline-flex;align-items:center;' +
            'justify-content:center;background:rgba(139,92,246,0.14);color:#6D28D9;padding:1px 6px;' +
            'border-radius:6px;font-size:0.68em;font-weight:700;margin-right:5px;vertical-align:middle;}';
        document.head.appendChild(s);
    }

    /**
     * Builds the premium "Amount Needed" badge markup for a given formatted
     * amount string. Shared by app-feed.js's own SOS card and app-sos.js's
     * SOS card + donate-button repair sweep, so there is exactly one badge
     * design in the whole app.
     * @param {string} fmtAmount — already-formatted amount (e.g. "$5,000")
     */
    function buildSosAmountBadgeHTML(fmtAmount) {
        _injectSosAmountBadgeStyles();
        const m = /^([^\d]{1,4})?\s*([\d.,]+.*)$/.exec(fmtAmount || '');
        const currencyPart = (m && m[1]) ? m[1].trim() : '';
        const numberPart   = (m && m[2]) ? m[2].trim() : (fmtAmount || '');
        return (
            '<div class="sos-goal-badge">'
            + '<span class="sos-goal-badge-watermark">'
            + '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21s-7.5-4.6-10-9.5C.3 7.9 2 4 6 4c2.1 0 3.6 1.2 6 4 2.4-2.8 3.9-4 6-4 4 0 5.7 3.9 4 7.5-2.5 4.9-10 9.5-10 9.5z"/></svg>'
            + '</span>'
            + '<span class="sos-goal-badge-shimmer"></span>'
            + '<span class="sos-goal-badge-icon-wrap">'
            + '<span class="sos-goal-badge-icon-ring"></span>'
            + '<span class="sos-goal-badge-icon">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.6-10-9.5C.3 7.9 2 4 6 4c2.1 0 3.6 1.2 6 4 2.4-2.8 3.9-4 6-4 4 0 5.7 3.9 4 7.5-2.5 4.9-10 9.5-10 9.5z"/></svg>'
            + '</span>'
            + '</span>'
            + '<span class="sos-goal-badge-text">'
            + '<span class="sos-goal-badge-label"><span class="sos-goal-badge-label-dot"></span>Amount Needed</span>'
            + '<span class="sos-goal-badge-amount">'
            + (currencyPart ? '<span class="sos-goal-badge-currency">' + currencyPart + '</span>' : '')
            + numberPart
            + '</span>'
            + '</span>'
            + '</div>'
        );
    }
    window.buildSosAmountBadgeHTML = buildSosAmountBadgeHTML;

    /**
     * Build and prepend an approved SOS post into #feed-container.
     * @param {Object} sosData — Firestore sos_queue document
     */
    function buildSosPostElement(sosData) {
        const el = document.createElement('div');
        el.className      = 'impact-story sos-request';
        el.dataset.postId  = sosData.id;
        el.dataset.userId  = sosData.userId;
        el.dataset.amount  = sosData.amount;
        el.dataset.currency= sosData.currency;
        el.dataset.username= sosData.username;

        let mediaHTML = '';
        if (sosData.media && sosData.media.length > 0) {
            const mc = sosData.media.length;
            const ml = mc === 1 ? 'solo' : mc === 2 ? 'duo' : mc === 3 ? 'trio' : 'grid';
            mediaHTML = '<div class="story-media-container" data-count="' + mc + '" data-layout="' + ml + '">';
            sosData.media.forEach(function (mi, idx) {
                /* Normalise: media items may be {url, type} objects or bare URL strings */
                if (typeof mi === 'string') mi = { url: mi, type: /\.(mp4|webm|ogg|mov)(\?|$)/i.test(mi) ? 'video/mp4' : 'image/jpeg' };
                if (!mi || !mi.url || mi.url.startsWith('blob:')) return;
                const isVid = (mi.type && mi.type.startsWith('video/'))
                    || /\.(mp4|webm|ogg|mov)(\?|$)/i.test(mi.url);
                mediaHTML += '<div class="story-media-item" data-index="' + idx + '">';
                if (isVid) {
                    mediaHTML += '<video src="' + mi.url + '" class="story-video" controls preload="metadata" playsinline></video>';
                } else {
                    mediaHTML += '<img src="' + mi.url + '" class="story-main-image" alt="SOS Evidence" loading="lazy">';
                }
                mediaHTML += '</div>';
            });
            mediaHTML += '</div>';
        }

        let amountStr = sosData.amount;
        try {
            const fmt = new Intl.NumberFormat('en-US', {
                style: 'currency', currency: sosData.currency || 'USD',
                minimumFractionDigits: (sosData.currency === 'EMPY' || sosData.currency === 'USDT') ? 2 : 0
            });
            amountStr = fmt.format(parseFloat(sosData.amount));
        } catch (e) {}

        const storyText = (typeof window.formatWhatsAppText === 'function')
            ? window.formatWhatsAppText(sosData.story || '') : (sosData.story || '');
        // FIX (Saved Posts parity): use the post's own createdAt when present
        // (so a bookmarked SOS post shows its REAL post date, not "now") —
        // falls back to the current time only for a brand-new post that
        // hasn't been given a timestamp yet, same as before.
        const ts = sosData.createdAt
            ? new Date(sosData.createdAt).toLocaleString('en-GB', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
              })
            : new Date().toLocaleString('en-GB', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
              });

        el.innerHTML =
            '<div class="story-header">'
            + '<div class="avatar-placeholder square"><img src="' + _attr(sosData.avatar) + '" alt="' + _attr(sosData.username) + '" loading="lazy"'
            + ' onerror="this.onerror=null;this.src=\'https://ui-avatars.com/api/?name=' + encodeURIComponent(sosData.username || 'U') + '&background=5B0EA6&color=fff&size=150\';">'
            + '<span class="avatar-urgency-badge"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8.5v4"/><path d="M12 15.8h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0z"/></svg></span>'
            + '</div>'
            + '<div class="story-user-info"><span class="sos-eyebrow">SOS Appeal</span><strong>' + _esc(sosData.title) + '</strong>'
            + '<span>Request by ' + _esc(sosData.username) + ' · ' + ts + '</span></div>'
            + '<span class="sos-badge"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 16.5h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0z"/></svg> SOS</span>'
            + '</div>'
            + '<div class="story-content">'
            + '<p>' + storyText + '</p>'
            + '</div>'
            + mediaHTML
            + '<div class="story-actions">'
            + '<a class="action-btn comment-btn" data-action="comment" title="Reply"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z"/></svg><span class="comment-count x-count"></span></span></a>'
            + '<a class="action-btn retweet-btn" data-action="retweet" title="Repost"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.932 9.48.568 8.02 5 3.88zM19.5 20.12l-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2H11V4h5.5c2.209 0 4 1.79 4 4v8.45l1.568-1.93 1.364 1.46-4.432 4.14z"/></svg><span class="retweet-count x-count"></span></span></a>'
            + '<a class="action-btn like-btn" data-action="like" title="Like"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z"/></svg><span class="like-count x-count"></span></span></a>'
            + '<a class="action-btn quote-btn" data-action="quote" title="Quote"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z"/><path d="M9 10.5c0-.28-.22-.5-.5-.5s-.5.22-.5.5.22.5.5.5.5-.22.5-.5zm3.5 0c0-.28-.22-.5-.5-.5s-.5.22-.5.5.22.5.5.5.5-.22.5-.5zm3.5 0c0-.28-.22-.5-.5-.5s-.5.22-.5.5.22.5.5.5.5-.22.5-.5z" fill="currentColor" stroke="none"/></svg><span class="quote-count x-count"></span></span></a>'
            + '<span class="action-btn view-count-display" title="Views"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><span class="view-count x-count"></span></span>'
            + '<a class="action-btn bookmark-btn" data-action="bookmark" title="Bookmark" style="margin-left:auto;"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l.5 1v16.5l-6-3.5-6 3.5V4l.5-1z"/></svg></span></a>'
            + '<a class="action-btn share-btn" data-action="share" title="Share"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg><span class="share-count x-count"></span></span></a>'
            + '<a class="action-btn download-media-btn" data-action="download" title="Download"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><rect x="4" y="18.4" width="16" height="2.2" rx="1.1" fill="currentColor" stroke="none"/></svg><span class="download-count x-count"></span></span></a>'
            + '</div>'
            + '<div style="padding:10px 16px 14px;">'
            + '<button class="gift-button sos-button help-now-btn"'
            + ' style="width:100%;padding:12px;font-size:0.95rem;font-weight:700;border-radius:12px;'
            + 'background:linear-gradient(135deg,#EF4444,#B91C1C);color:white;border:none;cursor:pointer;'
            + 'display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px;">'
            + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> Donate Now — Help ' + _esc(sosData.username)
            + '</button>'
            + buildSosAmountBadgeHTML(amountStr)
            + '</div>'
            + '<div class="comment-section">'
            + '<div class="comment-sheet-header"><span class="comment-sheet-title">Comments</span><button type="button" class="comment-sheet-close-btn" aria-label="Close comments"><i class="fas fa-times"></i></button></div>'
            + '<div class="comment-list"></div>'
            + '<form class="comment-form" novalidate>'
            + '<input type="text" name="comment-text" placeholder="Add a comment..." required>'
            + '<button type="submit"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>'
            + '</form></div>';

        return el;
    }
    window.buildSosPostElement = buildSosPostElement;

    function createSosPostOnFeed(sosData) {
        const fc = document.getElementById('feed-container');
        if (!fc) return;
        const el = buildSosPostElement(sosData);
        fc.prepend(el);
    }
    window.createSosPostOnFeed = createSosPostOnFeed;


    /* =========================================================================
       §3  CRISIS REPORT CARD
       ========================================================================= */

    /**
     * Build and prepend a crisis report into #feed-container.
     * @param {Object} crisisData — Firestore crisis_reports document
     */
    function buildCrisisPostElement(crisisData) {
        const us = _us();
        let mediaHTML = '';
        if (crisisData.media && crisisData.media.length > 0) {
            mediaHTML = '<div class="story-media-container" data-count="' + crisisData.media.length + '">';
            crisisData.media.forEach(function (mi) {
                // FIX (Saved Posts parity): normalise bare-string media items
                // the same way buildSosPostElement already does — the
                // original inline version here assumed every item was
                // already an {url,type} object, which is only guaranteed
                // for THIS file's own listener-fed data, not for data
                // re-fetched fresh from Firestore elsewhere (e.g. Saved
                // Posts, which stores/returns plain URL strings).
                if (typeof mi === 'string') mi = { url: mi, type: /\.(mp4|webm|mov)(\?|$)/i.test(mi) ? 'video/mp4' : 'image/jpeg' };
                if (!mi || !mi.url || mi.url.startsWith('blob:')) return;
                const isVid = (mi.type || '').startsWith('video/')
                    || /\/video\/upload\//i.test(mi.url)
                    || /\.(mp4|webm|mov)(\?|$)/i.test(mi.url);
                mediaHTML += '<div class="story-media-item">';
                if (isVid) {
                    mediaHTML += '<video src="' + mi.url + '" class="story-video" controls preload="metadata" playsinline></video>';
                } else {
                    mediaHTML += '<img src="' + mi.url + '" class="story-main-image" alt="Crisis Evidence" loading="lazy">';
                }
                mediaHTML += '</div>';
            });
            mediaHTML += '</div>';
        }

        const descHtml = (typeof window.formatWhatsAppText === 'function')
            ? window.formatWhatsAppText(crisisData.description || '') : (crisisData.description || '');
        const locationHtml = '<p style="font-size:0.9rem;color:#666;margin-top:10px;">'
            + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> <strong>Location:</strong> '
            + _esc(crisisData.location || 'Unknown') + '</p>';

        const canDelete = (crisisData.userId === us.id || _isAdmin());
        const ts = crisisData.createdAt
            ? new Date(crisisData.createdAt).toLocaleString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            : 'Recently';

        const el = document.createElement('div');
        el.className       = 'impact-story crisis-report';
        el.dataset.postId   = crisisData.id || ('crisis-' + Date.now());
        el.dataset.userId   = crisisData.userId;

        el.innerHTML =
            '<div class="story-header">'
            + '<div class="avatar-placeholder square"><img src="' + _attr(crisisData.avatar) + '" alt="' + _attr(crisisData.username) + '" loading="lazy"'
            + ' onerror="this.onerror=null;this.src=\'https://ui-avatars.com/api/?name=' + encodeURIComponent(crisisData.username || 'U') + '&background=5B0EA6&color=fff&size=150\';">'
            + '<span class="avatar-urgency-badge"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8.5v4"/><path d="M12 15.8h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0z"/></svg></span>'
            + '</div>'
            + '<div class="story-user-info">'
            + '<span class="crisis-eyebrow">Crisis Report</span><strong>' + _esc(crisisData.type) + '</strong>'
            + '<span>Reported by ' + _esc(crisisData.username) + ' · ' + ts + '</span></div>'
            + '<span class="crisis-badge"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 16.5h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0z"/></svg> Crisis</span>'
            + '<div class="post-options"><button class="options-btn"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>'
            + '<div class="options-menu">'
            + '<a href="#" class="promote-post-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg> Promote</a>'
            + (canDelete ? '<a href="#" class="delete-post-btn" style="color:#e53935;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg> Delete</a>' : '')
            + '</div></div></div>'
            + '<div class="story-content"><p>' + descHtml + '</p>' + locationHtml + '</div>'
            + mediaHTML
            + '<div class="story-actions">'
            + '<a class="action-btn comment-btn" data-action="comment" title="Reply"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z"/></svg><span class="comment-count x-count"></span></span></a>'
            + '<a class="action-btn retweet-btn" data-action="retweet" title="Repost"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.932 9.48.568 8.02 5 3.88zM19.5 20.12l-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2H11V4h5.5c2.209 0 4 1.79 4 4v8.45l1.568-1.93 1.364 1.46-4.432 4.14z"/></svg><span class="retweet-count x-count"></span></span></a>'
            + '<a class="action-btn like-btn" data-action="like" title="Like"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z"/></svg><span class="like-count x-count"></span></span></a>'
            + '<a class="action-btn quote-btn" data-action="quote" title="Quote"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z"/><path d="M9 10.5c0-.28-.22-.5-.5-.5s-.5.22-.5.5.22.5.5.5.5-.22.5-.5zm3.5 0c0-.28-.22-.5-.5-.5s-.5.22-.5.5.22.5.5.5.5-.22.5-.5zm3.5 0c0-.28-.22-.5-.5-.5s-.5.22-.5.5.22.5.5.5.5-.22.5-.5z" fill="currentColor" stroke="none"/></svg><span class="quote-count x-count"></span></span></a>'
            + '<span class="action-btn view-count-display" title="Views"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><span class="view-count x-count"></span></span>'
            + '<a class="action-btn bookmark-btn" data-action="bookmark" title="Bookmark" style="margin-left:auto;"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l.5 1v16.5l-6-3.5-6 3.5V4l.5-1z"/></svg></span></a>'
            + '<a class="action-btn share-btn" data-action="share" title="Share"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg><span class="share-count x-count"></span></span></a>'
            + '<a class="action-btn download-media-btn" data-action="download" title="Download"><span class="x-pill"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><rect x="4" y="18.4" width="16" height="2.2" rx="1.1" fill="currentColor" stroke="none"/></svg><span class="download-count x-count"></span></span></a>'
            + '</div>'
            + '<div class="comment-section">'
            + '<div class="comment-sheet-header"><span class="comment-sheet-title">Comments</span><button type="button" class="comment-sheet-close-btn" aria-label="Close comments"><i class="fas fa-times"></i></button></div>'
            + '<div class="comment-list"></div>'
            + '<form class="comment-form" novalidate>'
            + '<input type="text" name="comment-text" placeholder="Add a comment..." required>'
            + '<button type="submit"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>'
            + '</form></div>';

        return el;
    }
    window.buildCrisisPostElement = buildCrisisPostElement;

    function createCrisisPostOnFeed(crisisData) {
        const fc = document.getElementById('feed-container');
        if (!fc) return;
        const el = buildCrisisPostElement(crisisData);
        fc.prepend(el);
    }
    window.createCrisisPostOnFeed = createCrisisPostOnFeed;


    /* =========================================================================
       §4  REAL-TIME FIRESTORE LISTENERS
       ========================================================================= */

    /**
     * Start all 8 real-time Firestore onSnapshot listeners.
     * Requires Firebase to be loaded and a valid session to exist.
     * Guards against duplicate registrations using window._*Listener handles.
     * Called by: app-auth.js onAuthStateChanged, login handler, online-resume handler.
     */
    window._startRealtimeListeners = function () {
        var db = window.fbDb;

        /* ── Session validation ── */
        var _uid    = (window.fbAuth && window.fbAuth.currentUser && window.fbAuth.currentUser.uid) || null;
        var _lsUser = window.userState && window.userState.id
            && window.userState.id !== 'user-main' && !window.isGuest;
        var hasValidSession = !!_uid || !!_lsUser;

        if (!window._firebaseLoaded || !db) {
            console.warn('[Listeners] Firebase not ready — will retry.');
            if (typeof window._scheduleListenerRetry === 'function') window._scheduleListenerRetry();
            return;
        }
        if (!hasValidSession) {
            try {
                var _se = localStorage.getItem('empyrean_session_email');
                if (_se && window.userState && !window.isGuest) hasValidSession = true;
            } catch (e) {}
        }
        if (!hasValidSession) {
            console.warn('[Listeners] No authenticated user — will retry.');
            if (typeof window._scheduleListenerRetry === 'function') window._scheduleListenerRetry();
            return;
        }

        var uid = _uid || (window.userState && window.userState.id) || 'local';
        console.log('[Listeners] Starting real-time listeners for uid:', uid);

        function _unsub(handle) { try { if (typeof handle === 'function') handle(); } catch (e) {} }

        /* Clear Firebase pre-stubs on first real init */
        if (window._firstRealFirebaseInit) {
            window._firstRealFirebaseInit = false;
            ['_postsListener','_newsListener','_mktListener','_reelsListener',
             '_sosListener','_crisisListener','_announcementsListener','_usersListener']
                .forEach(function (k) {
                    var h = window[k];
                    if (h && typeof h === 'function') {
                        try { h(); } catch (e) {}
                        window[k] = null;
                    }
                });
            /* Also reset the app-news.js active flag so it can restart cleanly */
            window._newsListenerActive = false;
        }

        var us    = _us();
        var mu    = (_S().mockUsers)    || window.mockUsers    || {};
        var ru    = (_S().registeredUsers) || window.registeredUsers || {};

        /* ── 1. POSTS ─────────────────────────────────────────────────────── */
        if (!window._postsListener) {
            var _postsInitialBatch = true;
            window._postsListener = db.collection('posts')
                .orderBy('createdAt', 'desc').limit(40)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    var fc = document.getElementById('feed-container');
                    var es = document.getElementById('feed-empty-state');
                    snap.docChanges().forEach(function (change) {
                        var post = change.doc.data();
                        if (!post || !post.id) return;

                        if (change.type === 'added') {
                            /* SOS posts are rendered by the sos_queue listener with
                               their own card structure — skip them here to prevent a
                               plain generic card from blocking createSosPostOnFeed()
                               on refresh (duplicate-id guard would swallow the real card).
                               Guard: check isSOS flag first; fall back to id prefix for
                               older records that were saved before the isSOS flag existed. */
                            var _isSosPost = post.isSOS || /^sos-/i.test(post.id || '');
                            if (_isSosPost) {
                                /* If the sos_queue listener hasn't rendered it yet
                                   (e.g. sos_queue listener lost race), render it now
                                   so the card is never absent. createSosPostOnFeed has
                                   its own duplicate guard. */
                                if (fc && !fc.querySelector('[data-post-id="' + post.id + '"]')) {
                                    var _sosForFeed = {
                                        id:       post.id,
                                        userId:   post.userId,
                                        username: post.displayUsername || post.username,
                                        avatar:   post.avatar,
                                        title:    post.title  || 'SOS Request',
                                        story:    post.story  || post.text || '',
                                        amount:   post.sosAmount  || post.amount  || '',
                                        currency: post.sosCurrency || post.currency || 'NGN',
                                        media:    post.media  || [],
                                        status:   'approved'
                                    };
                                    if (typeof window.createSosPostOnFeed === 'function') {
                                        window.createSosPostOnFeed(_sosForFeed);
                                    }
                                }
                                return;
                            }
                            var alreadyInFeed = !!(fc && fc.querySelector('[data-post-id="' + post.id + '"]'));
                            var media = (post.media || [])
                                .filter(function (u) { return u && !u.startsWith('blob:'); })
                                .map(function (u) {
                                    return {
                                        _cloudUrl: u, url: u,
                                        type: (/\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(u) || /\/video\/upload\//i.test(u))
                                            ? 'video/mp4' : 'image/jpeg'
                                    };
                                });
                            var av = post.avatar
                                || ('https://ui-avatars.com/api/?name='
                                    + encodeURIComponent(post.username || 'U')
                                    + '&background=5B0EA6&color=fff&size=150');
                            /* FIX (bug: reposts/quote-posts render as "User" /
                               "Invalid Date"): app-thread.js's repost and
                               quote writers used to save `authorName`/
                               `retweeterName` (not `username`) and a raw
                               Firestore Timestamp for createdAt instead of
                               an ISO string — that write-side mismatch is
                               now fixed too, but existing documents already
                               saved with the old shape still need to render
                               correctly here without a data migration. */
                            var el = createNewPostElement(
                                post.text || '', media,
                                {
                                    id: post.userId,
                                    fullName: post.username || post.authorName || post.retweeterName || 'User',
                                    avatar: av
                                }
                            );
                            el.dataset.postId = post.id;
                            el.dataset.userId = post.userId;

                            /* Restore server timestamp */
                            var tsEl = el.querySelector('.story-user-info span');
                            if (tsEl && post.createdAt) {
                                var _createdDate = (post.createdAt && typeof post.createdAt.toDate === 'function')
                                    ? post.createdAt.toDate()   // Firestore Timestamp object
                                    : new Date(post.createdAt); // ISO string / number / already a Date
                                if (!isNaN(_createdDate.getTime())) {
                                    tsEl.textContent = _createdDate.toLocaleString('en-GB', {
                                        day: 'numeric', month: 'short', year: 'numeric',
                                        hour: '2-digit', minute: '2-digit'
                                    });
                                }
                                // If still unparseable, leave the optimistic-render
                                // timestamp already on the element rather than
                                // overwriting it with the literal text "Invalid Date".
                            }
                            /* Restore persisted like count */
                            var lkN  = post.likes || 0;
                            var rtN  = post.retweetCount || post.retweets || 0;
                            var qtN  = post.quoteCount   || 0;
                            var shN  = post.shareCount   || 0;
                            var dlN  = post.downloadCount|| 0;
                            var vcN  = post.views        || 0;
                            var cmN  = post.commentCount || 0;
                            var fmt  = function(n) { return n > 0 ? new Intl.NumberFormat().format(n) : ''; };
                            var lc = el.querySelector('.like-count');     if (lc) lc.textContent = fmt(lkN);
                            var rc = el.querySelector('.retweet-count');  if (rc) rc.textContent = fmt(rtN);
                            var qc = el.querySelector('.quote-count');    if (qc) qc.textContent = fmt(qtN);
                            var sc = el.querySelector('.share-count');    if (sc) sc.textContent = fmt(shN);
                            var dc = el.querySelector('.download-count'); if (dc) dc.textContent = fmt(dlN);
                            var vc = el.querySelector('.view-count');     if (vc) vc.textContent = fmt(vcN);
                            var cc = el.querySelector('.comment-count');  if (cc) cc.textContent = fmt(cmN);

                            if (fc && !alreadyInFeed) {
                                if (_postsInitialBatch) { fc.appendChild(el); } else {
                                    fc.prepend(el);
                                    /* Show "↑ N new posts" pill if user is scrolled down */
                                    if (typeof window._notifyNewPost === 'function') window._notifyNewPost();
                                }
                                if (es) es.style.display = 'none';
                            }

                            /* Mirror own posts to profile feeds */
                            if (post.userId === us.id && !post.isRetweet) {
                                ['profile-dash-feed', 'profile-posts-feed'].forEach(function (fid) {
                                    var pf = document.getElementById(fid);
                                    if (pf && !pf.querySelector('[data-post-id="' + post.id + '"]')) {
                                        var clone = el.cloneNode(true);
                                        if (_postsInitialBatch) { pf.appendChild(clone); } else { pf.prepend(clone); }
                                    }
                                });
                                if (post.media && post.media.length) {
                                    _addUrlsToProfileGallery(
                                        post.media.filter(function (u) { return u && !u.startsWith('blob:'); })
                                    );
                                }
                            }

                        } else if (change.type === 'removed') {
                            ['feed-container', 'profile-dash-feed', 'profile-posts-feed'].forEach(function (fid) {
                                var f2 = document.getElementById(fid);
                                if (f2) { var e2 = f2.querySelector('[data-post-id="' + post.id + '"]'); if (e2) e2.remove(); }
                            });
                        } else if (change.type === 'modified') {
                            /* Sync all interaction counts on the feed card when Firestore updates */
                            ['feed-container', 'profile-dash-feed', 'profile-posts-feed'].forEach(function (fid) {
                                var f3 = document.getElementById(fid);
                                if (!f3) return;
                                var card = f3.querySelector('[data-post-id="' + post.id + '"]');
                                if (!card) return;
                                var fmt = function(n) { return n > 0 ? new Intl.NumberFormat().format(n) : ''; };
                                var lkEl = card.querySelector('.like-count');
                                var rtEl = card.querySelector('.retweet-count');
                                var qtEl = card.querySelector('.quote-count');
                                var shEl = card.querySelector('.share-count');
                                var dlEl = card.querySelector('.download-count');
                                var vcEl = card.querySelector('.view-count');
                                var cmEl = card.querySelector('.comment-count');
                                if (lkEl) lkEl.textContent = fmt(post.likes);
                                if (rtEl) rtEl.textContent = fmt(post.retweetCount || post.retweets);
                                if (qtEl) qtEl.textContent = fmt(post.quoteCount);
                                if (shEl) shEl.textContent = fmt(post.shareCount);
                                if (dlEl) dlEl.textContent = fmt(post.downloadCount);
                                if (vcEl) vcEl.textContent = fmt(post.views);
                                if (cmEl) cmEl.textContent = fmt(post.commentCount);
                            });
                        }
                    });
                    _postsInitialBatch = false;
                }, function (err) {
                    console.error('[Listener:posts]', err.code, err.message);
                    window._postsListener = null;
                });
            console.log('[Firestore] ✅ posts listener active');
        }

        /* ── 2. NEWS — owned by app-news.js ──────────────────────────────── */
        /* app-news.js starts window._newsListener via its own _startNewsListener().
           It uses window._newsCache as source-of-truth so renderDashboardNews()
           never needs to scrape a hidden DOM section. Do not start a second
           listener here — the _newsListenerActive flag prevents double-starts. */
        if (typeof window._startNewsListener === 'function' && !window._newsListenerActive) {
            window._startNewsListener();
        }

        /* ── 3. MARKETPLACE ───────────────────────────────────────────────── */
        // FIX (2026-08-05 — root cause of "position/design fixes not
        // showing" across several reports): app-fixes.js's own copy of
        // _startRealtimeListeners (loaded later, at index.html's app-
        // fixes.js tag) is supposed to be the one and only version that
        // ever runs — it's reassigned onto window._startRealtimeListeners
        // and carries the current marketplace card design (avatar cards,
        // middle positioning, category-aware contact wording). But this
        // file's OWN copy, defined here, is still the version that exists
        // on window._startRealtimeListeners for the entire stretch between
        // this script executing and app-fixes.js's script executing later
        // in index.html. If Firebase's onAuthStateChanged microtask
        // resolves and calls window._startRealtimeListeners() anywhere in
        // that window (session-restore on a repeat visit can resolve fast
        // enough for this), THIS older implementation builds the
        // marketplace grid instead — with no dataset.category, no avatar
        // card, no middle positioning, and the generic "Contact Seller" /
        // "Please conduct due diligence" text app-patch-v2.js's category-
        // aware wording never gets a chance to run against. Once this
        // stale copy claims window._mktListener, app-fixes.js's own
        // "if (!window._mktListener)" guard skips entirely and the newer
        // design never takes over for that page load.
        // FIX: skip this file's own marketplace section whenever the newer
        // marketplace module (app-marketplace.js, loaded immediately after
        // this file in index.html) is already available — a reliable
        // signal that the real implementation is ready to take over.
        // window._mktListener is deliberately left unset in that case, so
        // whichever call reaches app-fixes.js's copy next (this same
        // startup pass, the online-reconnect handler, or the retry
        // backoff — all of which already exist) sets up the one true
        // marketplace listener instead. This file's other 7 listeners
        // (posts, news, reels, etc.) are unaffected — only marketplace is
        // skipped here, since that's the one app-fixes.js's copy actually
        // diverges from.
        if (false && !window._mktListener && typeof window._mktIsAvatarCategory !== 'function') {
            // DISABLED (request — "two or more marketplace cards should not
            // appear on the same site"): the guard above
            // (`typeof window._mktIsAvatarCategory !== 'function'`) was
            // meant to skip this stale copy once app-marketplace.js's
            // newer implementation was ready, but it's a load-order race,
            // not a guarantee — this file's own comment right above
            // already documents exactly that risk. If onAuthStateChanged
            // resolves before app-marketplace.js has executed (fast
            // session-restore on a repeat visit), this older listener
            // claims window._mktListener permanently for that page load,
            // and app-fixes.js's newer, category-aware, document-aware
            // card design never gets a chance to render. Hard-disabling
            // this block removes the race entirely: window._mktListener
            // is now never set here, so app-fixes.js's own "MARKETPLACE"
            // listener (its "if (!window._mktListener)" block) is
            // guaranteed to be the one that ever attaches, regardless of
            // timing. This file's other 7 listeners are untouched.
            window._mktListener = db.collection('marketplace_listings')
                .orderBy('createdAt', 'desc').limit(40)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    var grid      = document.getElementById('property-grid-container');
                    var mktSlider = document.getElementById('dashboard-market-slider');
                    snap.docChanges().forEach(function (change) {
                        var item = change.doc.data();
                        if (!item || !item.id) return;
                        if (change.type === 'added') {
                            var firstUrl = item.media && item.media[0] ? item.media[0] : '';
                            var isVid = (item.mediaTypes && (item.mediaTypes[0] || '').startsWith('video/'))
                                || /\/video\/upload\//i.test(firstUrl)
                                || /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(firstUrl);
                            var syms = { NGN: '₦', USD: '$', EUR: '€', GBP: '£', GHS: '₵', EMPY: 'EMPY ', USDT: 'USDT ' };
                            var sym      = syms[item.currency] || '$';
                            var priceStr = sym + parseFloat(item.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
                            var isNew    = item.createdAt && (Date.now() - new Date(item.createdAt).getTime() < 30000);

                            if (grid && !grid.querySelector('[data-id="' + item.id + '"]')) {
                                var allUrls = item.media || [];
                                var mktMediaHTML = '';
                                if (allUrls.length === 0) {
                                    mktMediaHTML = '<div style="width:100%;height:200px;background:linear-gradient(135deg,#1B2B8B,#0A0E27);'
                                        + 'display:flex;align-items:center;justify-content:center;">'
                                        + '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
                                } else if (allUrls.length === 1) {
                                    mktMediaHTML = isVid
                                        ? '<video src="' + firstUrl + '" autoplay loop muted playsinline controls style="width:100%;height:200px;object-fit:cover;display:block;"></video>'
                                        : '<img src="' + firstUrl + '" alt="' + _esc(item.name || '') + '" loading="lazy" style="width:100%;height:200px;object-fit:cover;display:block;">';
                                } else {
                                    var cols = allUrls.length === 2 ? '1fr 1fr' : allUrls.length === 3 ? '2fr 1fr' : '1fr 1fr';
                                    mktMediaHTML = '<div style="display:grid;grid-template-columns:' + cols + ';gap:3px;height:200px;overflow:hidden;">';
                                    allUrls.slice(0, 4).forEach(function (mu, mi) {
                                        var isV = /\.(mp4|webm|mov)(\?|$)/i.test(mu) || /\/video\/upload\//i.test(mu);
                                        var extra = allUrls.length === 3 && mi === 0 ? 'grid-row:1/3;' : '';
                                        mktMediaHTML += isV
                                            ? '<video src="' + mu + '" controls muted playsinline style="width:100%;height:100%;object-fit:cover;' + extra + '"></video>'
                                            : '<img src="' + mu + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;' + extra + '">';
                                    });
                                    if (allUrls.length > 4) {
                                        mktMediaHTML += '<div style="display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);color:white;font-size:1.2rem;font-weight:800;">+'
                                            + (allUrls.length - 4) + '</div>';
                                    }
                                    mktMediaHTML += '</div>';
                                }

                                var card = document.createElement('div');
                                card.className = 'property-card';
                                card.dataset.id      = item.id;
                                card.dataset.price   = item.price;
                                card.dataset.name    = item.name || '';
                                card.dataset.displayCurrency = item.currency;
                                card.dataset.salesType = item.salesType || '';
                                card.dataset.media   = JSON.stringify(item.media || []);
                                card.dataset.sellerId = item.sellerId || '';
                                card.innerHTML = mktMediaHTML
                                    + '<div class="property-info"><h4>' + _esc(item.name || '') + '</h4>'
                                    + '<p><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' + _esc(item.location || '') + '</p>'
                                    + '<div style="font-weight:700;color:var(--accent-color);font-size:1rem;">' + priceStr + '</div></div>'
                                    + '<div class="property-seller-info"><strong>@' + _esc(item.sellerName || item.username || 'Seller') + '</strong>'
                                    + (item.salesType === 'escrow'
                                        ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>'
                                        : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>')
                                    + '<span style="font-size:0.72rem;color:var(--text-muted);">'
                                    + (item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently')
                                    + '</span></div>'
                                    /* FIX (request — "the option Conduct Due Diligence should be
                                       removed"): dropped outright, matching the same fix in
                                       app-fixes.js's own (primary) card builder. */
                                    + '<div class="direct-contact-info" style="display:none;"></div>'
                                    + '<div class="property-actions">'
                                    + (item.salesType === 'escrow'
                                        ? '<button class="btn btn-accent add-to-cart-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Add to Cart</button>'
                                        : '<button class="btn btn-danger contact-seller-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.27a16 16 0 0 0 5.82 5.82l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> Contact Seller</button>')
                                    + '<button class="btn promote-post-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg> Promote</button>'
                                    + ((item.sellerId === us.id || _isAdmin())
                                        ? '<button class="btn edit-post-btn" style="background:rgba(27,43,139,0.08);color:var(--secondary);border:1px solid rgba(27,43,139,0.2);"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</button>'
                                        + '<button class="btn delete-post-btn" style="background:rgba(229,57,53,0.08);color:#e53935;border:1px solid rgba(229,57,53,0.2);"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg> Delete</button>'
                                        : '')
                                    + '</div>';

                                if (isNew) { grid.prepend(card); } else { grid.appendChild(card); }

                                /* Dashboard slider card */
                                if (mktSlider && !mktSlider.querySelector('[data-id="' + item.id + '"]')) {
                                    var dc = document.createElement('div');
                                    dc.className = 'dashboard-market-card';
                                    dc.dataset.id = item.id;
                                    dc.dataset.navTarget = 'marketplace';
                                    dc.innerHTML = (firstUrl
                                        ? (isVid
                                            ? '<video src="' + firstUrl + '" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;display:block;"></video>'
                                            : '<img src="' + firstUrl + '" alt="' + _esc(item.name || '') + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;">')
                                        : '')
                                        + '<div class="dashboard-market-card-info"><h5>' + _esc(item.name || '') + '</h5><p>' + priceStr + '</p></div>';
                                    if (isNew) { mktSlider.prepend(dc); } else { mktSlider.appendChild(dc); }
                                }
                                if (isNew && window.pushNotification) {
                                    window.pushNotification(
                                        '🛒 New listing: ' + (item.name || 'item') + ' by @' + (item.sellerName || 'seller'),
                                        'new_listing'
                                    );
                                }
                            }
                        } else if (change.type === 'removed') {
                            var e2 = grid && grid.querySelector('[data-id="' + item.id + '"]');
                            if (e2) e2.remove();
                        }
                    });
                }, function (err) {
                    console.error('[Listener:mkt]', err.code, err.message);
                    window._mktListener = null;
                });
            console.log('[Firestore] ✅ marketplace_listings listener active');
        }

        /* ── 4. REELS ─────────────────────────────────────────────────────── */
        if (!window._reelsListener) {
            window._reelsListener = db.collection('reels')
                .orderBy('createdAt', 'desc').limit(30)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    snap.docChanges().forEach(function (change) {
                        var reel = change.doc.data();
                        if (!reel || !reel.id || !reel.videoUrl || reel.videoUrl.startsWith('blob:')) return;
                        /* FIX ("chat icon in the reel section should show a
                           live comment count"): this listener used to bail
                           out for every change type except 'added' — so a
                           reel's grid card was built ONCE, from whatever
                           reel.comments.length was at that instant (almost
                           always 0, a brand-new reel), and never touched
                           again. Firestore fires 'modified', not 'added',
                           when the SAME doc is later updated — which is
                           exactly what the comment-send handler in
                           app-reel.js does (.update({ comments: [...] })
                           on the existing reels/{id} doc, see its own
                           comment) — so every comment posted after the
                           initial render, by this viewer or anyone else,
                           silently never reached the badge. Handling
                           'modified' here — read-only, updates the existing
                           card in place, no new card, no re-fetch — is what
                           makes the count live for every viewer watching
                           the grid, not just whoever opens the comments
                           drawer. */
                        if (change.type === 'modified') {
                            var _rgExisting = document.getElementById('reels-grid-container');
                            var _rgCard = _rgExisting && _rgExisting.querySelector('[data-post-id="' + reel.id + '"]');
                            if (_rgCard) {
                                var _rgCount = (reel.comments || []).length;
                                var _rgIndicator = _rgCard.querySelector('.reel-grid-comment-indicator');
                                var _rgCountEl = _rgCard.querySelector('.reel-comment-count');
                                if (_rgCountEl) _rgCountEl.textContent = _rgCount;
                                if (_rgIndicator) {
                                    _rgIndicator.setAttribute('aria-label', _rgCount + ' comments — view');
                                    _rgIndicator.setAttribute('title', _rgCount + ' comments');
                                }
                            }
                            return;
                        }
                        if (change.type !== 'added') return;

                        var isNew = reel.createdAt && (Date.now() - new Date(reel.createdAt).getTime() < 30000);

                        /* Dashboard slider */
                        var slider  = document.getElementById('dashboard-reels-slider');
                        var reelCnt = document.getElementById('dashboard-reels-container');
                        if (slider) {
                            if (reelCnt) reelCnt.style.display = 'block';
                            var existing = slider.querySelector('[data-reel-id="' + reel.id + '"]');
                            if (existing) {
                                var ev = existing.querySelector('video');
                                if (ev) ev.src = reel.videoUrl;
                                existing.dataset.reelId = reel.id;
                            } else {
                                var dc2 = document.createElement('div');
                                dc2.className = 'dashboard-reel-card';
                                dc2.dataset.navTarget = 'reels';
                                dc2.dataset.reelId    = reel.id;
                                var _reelAvFallback = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(reel.username || 'U') + '&background=1B2B8B&color=fff&size=80';
                                /* FIX (2026-08-22 — dashboard "New Reels" thumbnails rendering
                                   inconsistently): see _empReelPosterUrl in app-reel.js. Autoplay
                                   usually hides the black-box gap here, but autoplay can still be
                                   blocked (data-saver mode, some mobile browsers) — a poster keeps
                                   every card showing real content immediately either way. */
                                var _dashReelPoster = (typeof window._empReelPosterUrl === 'function') ? window._empReelPosterUrl(reel.videoUrl) : '';
                                dc2.innerHTML =
                                    '<video src="' + reel.videoUrl + '"' + (_dashReelPoster ? ' poster="' + _attr(_dashReelPoster) + '"' : '') + ' loop muted autoplay playsinline'
                                    + ' style="width:100%;height:100%;object-fit:cover;display:block;">'
                                    + '<source src="' + reel.videoUrl + '" type="video/mp4"></video>'
                                    + '<div class="reel-content">'
                                    + '<div class="dashboard-reel-avatar" title="@' + _attr(reel.username || 'user') + '">'
                                    + '<img src="' + _attr(reel.avatar || _reelAvFallback) + '" alt="@' + _attr(reel.username || '') + '" '
                                    + 'onerror="this.onerror=null;this.src=\'' + _reelAvFallback + '\';"></div>'
                                    + '</div>';
                                if (isNew) { slider.prepend(dc2); } else { slider.appendChild(dc2); }
                            }
                        }

                        /* Main reels grid */
                        var rg = document.getElementById('reels-grid-container');
                        if (rg) {
                            var existCard = rg.querySelector('[data-post-id="' + reel.id + '"]');
                            if (existCard) {
                                var ev2 = existCard.querySelector('video');
                                if (ev2 && reel.videoUrl) ev2.src = reel.videoUrl;
                                existCard.dataset.videoUrl = reel.videoUrl;
                            } else {
                                var rc = document.createElement('div');
                                rc.className        = 'reel-card';
                                rc.dataset.postId   = reel.id;
                                rc.dataset.videoUrl = reel.videoUrl;
                                rc.dataset.userId   = reel.userId || '';
                                rc.dataset.createdAt = reel.createdAt || '';
                                /* FIX (2026-08-10 — reel viewer showing literal "@user" instead
                                   of the author's name): _buildReelViewerItem() in app-reel.js
                                   (fires when this card is tapped to open the fullscreen reel
                                   viewer) reads the author's name from THIS card's data-username
                                   attribute first, falling back to a DOM lookup for an element
                                   with "username" in its class name, and only as a last resort
                                   the literal string 'user'. This card never set data-username at
                                   all, and the <span> below showing the name has no class
                                   attribute for that fallback lookup to match — so every reel
                                   opened from this grid fell straight through to the hardcoded
                                   'user' placeholder, no matter what name was actually stored on
                                   the reel doc.
                                   NOTE: this exact same gap was first (mistakenly) fixed only in
                                   app-fixes.js's own near-duplicate reels listener — but THIS
                                   listener, in app-feed.js, loads first in index.html and wins
                                   the window._reelsListener race, so it — not the one in
                                   app-fixes.js — is the one that actually runs. Fixing it here is
                                   what actually reaches the live site. app-fixes.js's copy of
                                   this listener never executes as long as this one wins that
                                   race, but its own fix is left in place as a harmless safety net
                                   in case load order ever changes. */
                                rc.dataset.username  = reel.username || 'user';
                                rc.dataset.avatar    = reel.avatar   || '';
                                rc.dataset.caption   = reel.caption  || '';

                                /* REEL SECTION REDESIGN (2026-08-10): below-thumbnail
                                   two-column meta row (creator + time on the left, a direct
                                   comment button on the right) plus a three-dot "more options"
                                   menu (Download / Share / Like / Report, and Edit/Delete for
                                   the owner or an admin). The old on-video gradient overlay
                                   (avatar/username/caption painted over the thumbnail) is gone
                                   — the same info now lives in real DOM below the thumbnail
                                   instead, per this session's spec. Auto-play-at-top / sticky
                                   "now playing" behavior, opening the kebab menu, and the
                                   Report flow are all wired generically off these same
                                   classes/data-attributes in app-reel.js (the reels engagement
                                   module) — this file only needs to emit the markup. */
                                var _reelAvFallback2 = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(reel.username || 'U') + '&background=1B2B8B&color=fff&size=80';
                                var _reelShareUrl    = window.location.origin + '/?post=' + encodeURIComponent(reel.id);
                                var _canModerate     = (reel.userId === us.id || _isAdmin());

                                /* REDESIGN (2026-08-10, follow-up): the video "player" area is
                                   now wrapped in .reel-video-wrap (kept deliberately compact —
                                   see .reel-video-wrap > video's max-height in app-reel.js) and
                                   carries its own play/pause + mute/unmute control pair
                                   (.reel-audio-controls), shown only while this card is the
                                   active/playing one. The three-dot "more options" menu has
                                   moved off the video entirely — it now sits in
                                   .reel-meta-actions, directly after the Comment button, instead
                                   of floating over the top-right corner of the thumbnail. */
                                /* FIX (2026-08-22 — thumbnails rendering
                                   inconsistently / solid black before
                                   playback): see _empReelPosterUrl's own
                                   header comment in app-reel.js — this
                                   generates a real poster frame so the
                                   card shows actual content immediately
                                   instead of racing video-decode timing.
                                   Guarded: if app-reel.js hasn't attached
                                   the helper yet, or it can't derive a
                                   poster for this URL, posterAttr is just
                                   '' and rendering is unchanged from
                                   before this fix. */
                                var _reelPosterUrl = (typeof window._empReelPosterUrl === 'function') ? window._empReelPosterUrl(reel.videoUrl) : '';
                                rc.innerHTML =
                                    '<div class="reel-video-wrap">'
                                        + '<video src="' + reel.videoUrl + '"' + (_reelPosterUrl ? ' poster="' + _attr(_reelPosterUrl) + '"' : '') + ' loop muted playsinline preload="metadata"></video>'
                                        /* DURATION BADGE (this session, point 1): small dark
                                           pill in the bottom-right corner of the thumbnail
                                           showing the clip's length (e.g. "0:16"), matching the
                                           reference screenshot. Starts empty (CSS hides an empty
                                           badge) and is filled in by app-reel.js's
                                           _wireReelDurations() once the video's metadata loads —
                                           preload="metadata" above means that duration becomes
                                           available WITHOUT the video ever actually playing. */
                                        + '<span class="reel-duration-badge" data-reel-id="' + _attr(reel.id) + '"></span>'
                                        /* INLINE UPLOAD ICON (2026-08-10): small trigger for the
                                           reel composer, anchored directly on the video itself so
                                           it's always right next to the pinned "now playing" card
                                           (point 4 of this session's request). Only ever shown while
                                           THIS card is the active/pinned one — see the matching
                                           ".reel-card.reel-card-active .reel-inline-upload-btn"
                                           display rule in app-reel.js — every other (non-active)
                                           card in the grid keeps this hidden, same pattern already
                                           used for .reel-audio-controls above. Reuses the shared
                                           .section-create-toggle-btn click handler (app-fixes.js)
                                           via data-panel, so no new JS wiring is needed here. */
                                        + '<button type="button" class="section-create-toggle-btn reel-inline-upload-btn" data-panel="reels-create-panel" aria-label="Record or upload a reel" title="Post a Short Reel"><i class="fas fa-plus"></i></button>'
                                        + '<div class="reel-audio-controls">'
                                            /* ICON FIX (2026-08-10): this button starts out playing
                                               (reels autoplay muted as soon as they become the pinned
                                               card), so its icon must start matching the toggle logic
                                               in app-reel.js, which only ever adds/removes
                                               fa-play/fa-pause.
                                               PREMIUM ICON PASS (this session): was fa-circle-pause —
                                               that glyph draws its own ring, which doubled up with
                                               this button's own circular glass background. Switched to
                                               the plain fa-pause glyph (paired with fa-play on toggle)
                                               so only one ring shows. Keep this in sync with BOTH
                                               fa-play/fa-pause toggle sites in app-reel.js if either
                                               ever changes again. */
                                            + '<button class="reel-playpause-btn" data-reel-id="' + _attr(reel.id) + '" aria-label="Play or pause" title="Play/Pause"><i class="fas fa-pause"></i></button>'
                                            /* AUDIO FIX (2026-08-11): a prior session removed the
                                               manual mute/unmute toggle entirely, but reels autoplay
                                               muted by hard browser requirement — with the toggle
                                               gone there was no way left for a person to ever hear
                                               the pinned/"now playing" reel's audio at all (it just
                                               stayed silently muted forever). Restored here, wired
                                               in app-reel.js's delegated click listener + reset
                                               alongside the play/pause icon in _applyActiveReelOrdering()
                                               so a freshly-pinned reel always starts back at muted
                                               (matching the actual autoplay state) rather than
                                               showing a stale "unmuted" icon from a previous card. */
                                            + '<button class="reel-mute-btn" data-reel-id="' + _attr(reel.id) + '" aria-label="Mute or unmute" title="Tap for sound"><i class="fas fa-volume-mute"></i></button>'
                                        + '</div>'
                                    + '</div>'
                                    + (reel.caption ? '<div class="reel-caption-line">' + _esc(reel.caption) + '</div>' : '')
                                    + '<div class="reel-meta-row">'
                                        /* PROFILE TAP SPLIT (this session, point 3): the whole
                                           .reel-meta-left block used to carry ONE
                                           data-view-profile attribute, so tapping either the
                                           avatar OR the username jumped straight to the full
                                           profile page. Now split: the avatar alone opens a
                                           quick preview sheet (data-preview-profile — see
                                           app-reel.js's delegated handler, which reuses the
                                           app's existing generic profile-preview sheet,
                                           window.openHostPreviewModal(), already used the same
                                           way for live-stream host/guest avatars), and only the
                                           username text itself (data-view-profile, unchanged
                                           attribute/behavior) still jumps straight to the full
                                           profile page. data-view-profile is removed from this
                                           wrapping div so it no longer fires from anywhere else
                                           inside it (e.g. the timestamp). */
                                        + '<div class="reel-meta-left">'
                                            + '<img class="reel-meta-avatar" data-preview-profile="' + _attr(reel.userId || '') + '" src="' + _attr(reel.avatar || _reelAvFallback2) + '" onerror="this.onerror=null;this.src=\'' + _reelAvFallback2 + '\';">'
                                            + '<div class="reel-meta-text">'
                                                + '<span class="reel-meta-username" data-view-profile="' + _attr(reel.userId || '') + '">@' + _esc(reel.username || 'user') + '</span>'
                                                + '<span class="reel-meta-time" data-created-at="' + _attr(reel.createdAt || '') + '">' + (typeof window._timeAgo === 'function' && reel.createdAt ? window._timeAgo(reel.createdAt) : 'Recently') + '</span>'
                                            + '</div>'
                                        + '</div>'
                                        + '<div class="reel-meta-actions">'
                                            /* COMMENT RELOCATION (earlier session, point 2): the
                                               standalone "Comment" pill that used to sit here,
                                               next to the kebab, was removed and moved inside the
                                               three-dot menu as just one item among several — but
                                               that meant there was no way to tell a reel HAD
                                               comments without opening the menu first. Reported
                                               back (2026-08-11): "let there be an indication...
                                               for users to know that message is hidden behind the
                                               3 dots". This small indicator restores just the
                                               count + icon (not the full pill button), sitting
                                               right before the kebab per that request, and reuses
                                               the same .reel-comment-btn class + data-reel-id the
                                               kebab-menu Comment item and viewer engagement bar
                                               already use — so tapping it opens the exact same
                                               shared comments drawer (_openReelCommentsDrawer(),
                                               app-reel.js) with zero new click-handling code.
                                               reel.comments is the reel doc's own persisted
                                               Firestore field (see the comment-send handler in
                                               app-reel.js, which writes the whole array back with
                                               .update({ comments: ... })) — read directly off the
                                               snapshot here, at render time, rather than off
                                               app-reel.js's _reelData session cache, which starts
                                               empty every load and is never seeded from Firestore;
                                               reading it here is what gets the TRUE total instead
                                               of always showing 0 until someone opens the drawer
                                               once this session. */
                                            + '<button class="reel-grid-comment-indicator reel-comment-btn" data-reel-id="' + _attr(reel.id) + '" aria-label="' + (reel.comments || []).length + ' comments — view" title="' + (reel.comments || []).length + ' comments">'
                                                + '<i class="fas fa-comment-dots"></i><span class="reel-comment-count">' + (reel.comments || []).length + '</span>'
                                            + '</button>'
                                            + '<div class="reel-kebab-wrap">'
                                                + '<button class="reel-kebab-btn" data-reel-id="' + _attr(reel.id) + '" aria-label="More options" title="More options"><i class="fas fa-ellipsis-v"></i></button>'
                                                + '<div class="reel-kebab-menu" data-reel-id="' + _attr(reel.id) + '">'
                                                    + '<button class="reel-kebab-item reel-comment-btn" data-reel-id="' + _attr(reel.id) + '"><i class="fas fa-comment-dots"></i> Comment</button>'
                                                    + '<button class="reel-kebab-item reel-download-btn" data-url="' + _attr(reel.videoUrl) + '" data-reel-id="' + _attr(reel.id) + '"><i class="fas fa-download"></i> Download</button>'
                                                    /* Icon match (2026-08-22): this used to be a plain
                                                       <i class="fas fa-share-alt">, the only Share button
                                                       in the app still using that Font Awesome glyph
                                                       instead of the inline SVG (3 nodes + 2 lines) every
                                                       other section already uses for Share — the reel's
                                                       own fullscreen viewer engagement bar included (see
                                                       this same file's reel-eng-btn.reel-share-btn a few
                                                       hundred lines up). Swapped to the identical SVG
                                                       markup, sized/aligned to sit inline with this menu's
                                                       other icons (Comment/Download/Like/Report, still
                                                       <i> tags at 14px via ".reel-kebab-item i" in
                                                       app-reel.js's CSS) — flex-shrink:0 replicates that
                                                       rule's effect for this one non-<i> icon. */
                                                    + '<button class="reel-kebab-item reel-share-btn" data-url="' + _attr(_reelShareUrl) + '" data-reel-id="' + _attr(reel.id) + '"><svg viewBox="0 0 24 24" width="14" height="14" style="flex-shrink:0;" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share</button>'
                                                    + '<button class="reel-kebab-item reel-like-btn" data-reel-id="' + _attr(reel.id) + '" data-user-id="' + _attr(reel.userId || '') + '"><i class="fas fa-heart"></i> Like <span class="reel-like-count">0</span></button>'
                                                    + '<button class="reel-kebab-item reel-report-btn" data-reel-id="' + _attr(reel.id) + '"><i class="fas fa-flag"></i> Report</button>'
                                                    + (_canModerate
                                                        ? '<a href="#" class="reel-kebab-item edit-post-btn"><i class="fas fa-pencil-alt"></i> Edit</a>'
                                                            + '<a href="#" class="reel-kebab-item delete-post-btn danger"><i class="fas fa-trash"></i> Delete</a>'
                                                        : '')
                                                + '</div>'
                                            + '</div>'
                                        + '</div>'
                                    + '</div>';

                                var reEmpty = document.getElementById('reels-empty-state');
                                if (reEmpty) reEmpty.style.display = 'none';
                                if (isNew) { rg.prepend(rc); } else { rg.appendChild(rc); }
                                /* Auto-play-at-top ordering (latest, or whichever reel the
                                   person last tapped, stays pinned + playing while the rest of
                                   the feed scrolls underneath it) is owned by app-reel.js —
                                   nudge it to re-evaluate now that a new card exists. */
                                if (typeof window._empReelsApplyActiveOrdering === 'function') window._empReelsApplyActiveOrdering();
                            }
                        }

                        if (isNew && window.pushNotification) {
                            window.pushNotification('🎬 New reel from @' + (reel.username || 'someone') + '!', 'new_reel');
                        }
                    });
                }, function (err) {
                    console.error('[Listener:reels]', err.code, err.message);
                    window._reelsListener = null;
                    if (err.code !== 'permission-denied') {
                        setTimeout(function () {
                            if (!window._reelsListener && typeof window._startRealtimeListeners === 'function') {
                                window._startRealtimeListeners();
                            }
                        }, 5000);
                    }
                });
            console.log('[Firestore] ✅ reels listener active');
        }

        /* ── 5. SOS QUEUE ─────────────────────────────────────────────────── */
        if (!window._sosListener) {
            window._sosListener = db.collection('sos_queue').limit(30)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    snap.docChanges().forEach(function (change) {
                        var sos = change.doc.data();
                        if (!sos || !sos.id) return;

                        /* 'added'    — document first seen by this client (fresh posts + on page reload)
                           'modified' — admin called .update({status:'approved'}) on an existing doc;
                                        Firestore fires 'modified', NOT 'added', so we must handle both. */
                        if ((change.type === 'added' || change.type === 'modified') && sos.status === 'approved') {
                            var fc = document.getElementById('feed-container');
                            if (fc) {
                                /* If a plain generic card was previously rendered for this id
                                   (e.g. from the posts listener on refresh), remove it first
                                   so the proper SOS card can take its place. */
                                var existing = fc.querySelector('[data-post-id="' + sos.id + '"]');
                                if (existing && !existing.classList.contains('sos-request')) {
                                    existing.remove();
                                }
                                if (!fc.querySelector('[data-post-id="' + sos.id + '"]')) {
                                    createSosPostOnFeed(sos);
                                }
                            }
                        }

                        /* When status changes away from approved (held/rejected), remove from feed */
                        if (change.type === 'modified' && sos.status !== 'approved') {
                            var staleEl = document.querySelector('[data-post-id="' + sos.id + '"]');
                            if (staleEl && staleEl.classList.contains('sos-request')) staleEl.remove();
                        }

                        if (change.type === 'removed') {
                            var el2 = document.querySelector('[data-post-id="' + sos.id + '"]');
                            if (el2) el2.remove();
                        }
                    });
                    /* Repair: inject donate button on any SOS card that is missing it */
                    setTimeout(function () {
                        document.querySelectorAll('.impact-story.sos-request').forEach(function (p) {
                            if (!p.querySelector('.help-now-btn')) {
                                var uname = p.dataset.username || 'this cause';
                                var wrap  = document.createElement('div');
                                wrap.style.cssText = 'padding:10px 16px 14px;';
                                wrap.innerHTML = '<button class="gift-button sos-button help-now-btn" style="width:100%;padding:12px;'
                                    + 'font-size:0.95rem;font-weight:700;border-radius:12px;background:linear-gradient(135deg,#EF4444,#B91C1C);'
                                    + 'color:white;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">'
                                    + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> Donate Now — Help ' + _esc(uname) + '</button>';
                                var ac = p.querySelector('.story-actions');
                                if (ac) { p.insertBefore(wrap, ac.nextSibling); } else { p.appendChild(wrap); }
                            }
                        });
                    }, 400);
                }, function (err) {
                    console.error('[Listener:sos]', err.code, err.message);
                    window._sosListener = null;
                });
            console.log('[Firestore] ✅ sos_queue listener active');
        }

        /* ── 6. CRISIS REPORTS ────────────────────────────────────────────── */
        if (!window._crisisListener) {
            window._crisisListener = db.collection('crisis_reports')
                .orderBy('createdAt', 'desc').limit(20)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    snap.docChanges().forEach(function (change) {
                        var cr = change.doc.data();
                        if (!cr) return;
                        cr.id = cr.id || change.doc.id;
                        if (change.type === 'removed') {
                            var fc = document.getElementById('feed-container');
                            if (fc) { var r = fc.querySelector('[data-post-id="' + cr.id + '"]'); if (r) r.remove(); }
                            return;
                        }
                        if (change.type === 'added') {
                            var fc2 = document.getElementById('feed-container');
                            if (!fc2) return;
                            if (fc2.querySelector('[data-post-id="' + cr.id + '"]')) return;
                            createCrisisPostOnFeed(cr);
                        }
                    });
                }, function (err) {
                    console.error('[Listener:crisis]', err.code, err.message);
                    window._crisisListener = null;
                });
            console.log('[Firestore] ✅ crisis_reports listener active');
        }

        /* ── 7. ANNOUNCEMENTS ─────────────────────────────────────────────── */
        // BUGFIX: this used to only push a bell notification and never
        // actually rendered anything -- announcements only ever appeared in
        // the feed/admin list because the publish handler injected them into
        // the DOM directly. On refresh (new session, new tab, another
        // device) that DOM state is gone and nothing re-loads it from
        // Firestore, so published announcements "disappeared". This listener
        // now also renders (and keeps in sync) the feed post + admin list
        // card for every announcement doc, using the shared builders exposed
        // by app-fixes.js when available, with a plain-text fallback if not.
        if (!window._announcementsListener) {
            var _annFirstLoad = true;
            var _annIconsText = { announcement: '[Announcement]', appreciation: '[Appreciation]', update: '[Update]', 'sos-thanks': '[SOS Thanks]' };
            var _annIconsEmoji = { announcement: '📢', appreciation: '🏆', update: '🔔', 'sos-thanks': '❤️' };

            function _annRenderFeedPost(id, ann) {
                var fc = document.getElementById('feed-container');
                if (!fc || typeof createNewPostElement !== 'function') return;
                var existing = fc.querySelector('[data-ann-id="' + id + '"]');
                var hasMedia = ann.media && ann.media.length > 0;
                if (existing) {
                    // Post already rendered (optimistically or from an earlier
                    // snapshot) -- only rebuild it if media has since arrived.
                    if (hasMedia && !existing.querySelector('.story-media-container')) {
                        var refreshed = createNewPostElement(
                            (_annIconsText[ann.type] || '[Notice]') + ' ' + (ann.title || ''),
                            ann.media,
                            { id: 'admin-user', fullName: 'Empyrean Admin', avatar: 'https://ui-avatars.com/api/?name=EA&background=5B0EA6&color=fff&size=150' }
                        );
                        refreshed.setAttribute('data-ann-id', id);
                        if (typeof window.applyAnnouncementStyling === 'function') window.applyAnnouncementStyling(refreshed, ann.type, ann.title, ann.body);
                        existing.replaceWith(refreshed);
                    }
                    return;
                }
                var post = createNewPostElement(
                    (_annIconsText[ann.type] || '[Notice]') + ' ' + (ann.title || ''),
                    ann.media || [],
                    { id: 'admin-user', fullName: 'Empyrean Admin', avatar: 'https://ui-avatars.com/api/?name=EA&background=5B0EA6&color=fff&size=150' }
                );
                post.setAttribute('data-ann-id', id);
                if (typeof window.applyAnnouncementStyling === 'function') {
                    window.applyAnnouncementStyling(post, ann.type, ann.title, ann.body);
                }
                fc.prepend(post);
                var emptyState = document.getElementById('feed-empty-state');
                if (emptyState) emptyState.style.display = 'none';
            }

            function _annRenderAdminCard(id, ann) {
                var list = document.getElementById('admin-announcements-list');
                if (!list || list.querySelector('[data-ann-id="' + id + '"]')) return;
                if (typeof window.renderAnnouncementCard !== 'function') return;
                var ep = list.querySelector('p');
                if (ep) ep.remove();
                var createdAt = ann.createdAt ? new Date(ann.createdAt).getTime() : Date.now();
                list.prepend(window.renderAnnouncementCard(id, ann.type, ann.title, ann.body, createdAt));
            }

            window._announcementsListener = db.collection('announcements')
                .orderBy('createdAt', 'asc').limitToLast(10)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    var isInitialLoad = _annFirstLoad;
                    snap.docChanges().forEach(function (change) {
                        var ann = change.doc.data();
                        if (!ann) return;
                        var id = change.doc.id;

                        if (change.type === 'removed') {
                            var fc = document.getElementById('feed-container');
                            if (fc) { var rp = fc.querySelector('[data-ann-id="' + id + '"]'); if (rp) rp.remove(); }
                            var list = document.getElementById('admin-announcements-list');
                            if (list) {
                                var rc = list.querySelector('[data-ann-id="' + id + '"]');
                                if (rc) rc.remove();
                                if (!list.querySelector('[data-ann-id]')) {
                                    list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted);">No announcements yet.</p>';
                                }
                            }
                            return;
                        }

                        // 'added' (including everything loaded on first page-load)
                        // and 'modified' (e.g. media attached after publish) both
                        // need the post/card present and up to date.
                        _annRenderFeedPost(id, ann);
                        _annRenderAdminCard(id, ann);

                        // Only ring the bell for genuinely new announcements that
                        // arrive after the initial load -- otherwise every past
                        // announcement would re-notify on every page refresh.
                        if (!isInitialLoad && change.type === 'added' && window.pushNotification) {
                            var icon = _annIconsEmoji[ann.type] || '📢';
                            window.pushNotification(icon + ' ' + (ann.title || 'Admin Announcement'), 'announcement');
                        }
                    });
                    _annFirstLoad = false;
                }, function (err) {
                    console.error('[Listener:announcements]', err.code, err.message);
                    window._announcementsListener = null;
                });
            console.log('[Firestore] ✅ announcements listener active');
        }

        /* ── 8. USERS (suggested / follow) ───────────────────────────────── */
        if (!window._usersListener) {
            window._usersListener = db.collection('users').limit(50)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    snap.docChanges().forEach(function (change) {
                        var u = change.doc.data();
                        if (!u || !u.id || u.id === us.id) return;
                        ['likedPostIds','followedUserIds','retweetedPostIds',
                         'awardedRanks','completedTasks','viewedStatusUserIds'].forEach(function (k) {
                            u[k] = new Set(Array.isArray(u[k]) ? u[k] : []);
                        });
                        if (change.type === 'added' || change.type === 'modified') {
                            mu[u.id] = u;
                            if (u.email) ru[u.email] = u;
                        } else if (change.type === 'removed') {
                            delete mu[u.id];
                        }
                    });
                    if (typeof window.renderSuggestedUsers === 'function') window.renderSuggestedUsers();
                }, function (err) {
                    console.error('[Listener:users]', err.code, err.message);
                    window._usersListener = null;
                });
            console.log('[Firestore] ✅ users listener active');
        }

        /* ── 9. STATUSES — load all non-expired statuses from Firestore ──── */
        /* BUG FIX: statuses were never fetched on app start, so they disappeared
           after every page refresh. This listener keeps userStatuses in sync. */
        if (!window._statusesListener) {
            var STATUS_EXPIRY_MS_FEED = 24 * 60 * 60 * 1000;
            window._statusesListener = db.collection('statuses')
                .orderBy('createdAt', 'desc').limit(60)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    if (!window.userStatuses) window.userStatuses = [];
                    snap.docChanges().forEach(function (change) {
                        var s = change.doc.data();
                        if (!s || !s.userId) return;
                        s.docId = s.docId || change.doc.id;
                        /* Filter expired items */
                        if (s.items) {
                            s.items = s.items.filter(function (item) {
                                return !item.createdAt ||
                                    (Date.now() - new Date(item.createdAt).getTime()) < STATUS_EXPIRY_MS_FEED;
                            });
                        }
                        if (!s.items || s.items.length === 0) {
                            /* Remove from local array — all items expired */
                            window.userStatuses = window.userStatuses.filter(function (x) { return x.userId !== s.userId; });
                            return;
                        }
                        if (change.type === 'removed') {
                            window.userStatuses = window.userStatuses.filter(function (x) { return x.userId !== s.userId; });
                        } else {
                            var idx = window.userStatuses.findIndex(function (x) { return x.userId === s.userId; });
                            /* Preserve viewed flag from current local state if newer */
                            if (idx > -1) {
                                s.viewed = s.viewed || window.userStatuses[idx].viewed;
                                window.userStatuses[idx] = s;
                            } else {
                                window.userStatuses.push(s);
                            }
                        }
                    });
                    /* Sort: own status first, then unviewed, then by createdAt */
                    var myId = (window.userState && window.userState.id) || '';
                    window.userStatuses.sort(function(a, b) {
                        if (a.userId === myId) return -1;
                        if (b.userId === myId) return 1;
                        if (!a.viewed && b.viewed) return -1;
                        if (a.viewed && !b.viewed) return 1;
                        return 0;
                    });
                    if (typeof window.renderStatusBar === 'function') window.renderStatusBar();
                }, function (err) {
                    console.warn('[Listener:statuses]', err.code, err.message);
                    window._statusesListener = null;
                });
            console.log('[Firestore] ✅ statuses listener active');
        }

        /* ── 10. SOS QUEUE + CRISIS REPORTS — delegated to app-sos.js ─────── */
        /* BUG FIX: app-sos.js defines startSosListeners(db) which attaches the
           'sos_queue' and 'crisis_reports' onSnapshot listeners responsible for
           publishing an admin-approved SOS request onto the public dashboard
           feed (createSosPostOnFeed). That function was never invoked anywhere
           in the app, so window._sosListener/_crisisListener were always null —
           meaning an approval only ever rendered locally in the admin's own
           browser tab and never reached any other user's dashboard, even after
           a refresh. Starting it here, alongside the other 8 listeners, fixes
           that without touching the donation-button code path. */
        if (typeof window.startSosListeners === 'function') {
            window.startSosListeners(db);
        } else {
            console.warn('[Listeners] startSosListeners() not found — SOS posts will not sync to dashboard.');
        }

        console.log('[Firestore] ✅ ALL real-time listeners active — full cross-device sync enabled');

        setTimeout(function () {
            if (typeof window._populateHomeBioCard === 'function') window._populateHomeBioCard();
            if (typeof window.renderSuggestedUsers  === 'function') window.renderSuggestedUsers();
        }, 500);
    };


    /* =========================================================================
       §5  DASHBOARD NEWS SLIDER — delegated to app-news.js
       =========================================================================
       app-news.js defines window.renderDashboardNews() using window._newsCache
       as source-of-truth, avoiding the hidden-section DOM-scraping bug.
       This stub ensures any legacy call to renderDashboardNews() before
       app-news.js loads is safely silenced.
       ========================================================================= */
    if (typeof window.renderDashboardNews !== 'function') {
        window.renderDashboardNews = function () {
            /* no-op until app-news.js loads and overwrites this */
        };
    }


    /* =========================================================================
       §6  SUGGESTED USERS WIDGET
       ========================================================================= */

    /**
     * Populate the suggested users slider in #suggested-users-container.
     * Fetches users from Firestore once per session; subsequent calls use cache.
     */
    function renderSuggestedUsers() {
        var container = document.getElementById('suggested-users-container');
        var slider    = document.getElementById('suggested-users-slider');
        var bioCard   = document.getElementById('home-user-bio-card');
        var us        = _us();
        if (_isGuest() || !container || !slider) return;

        /* Kick off Firestore fetch once */
        if (window.fbDb && window._firebaseLoaded && !window._suggestedFetchDone) {
            window._suggestedFetchDone = true;
            // FIX (suggested-card cover photo missing/stale): { source: 'server' }
            // forces this past Firestore's local/offline cache (this app enables
            // persistence with synchronizeTabs — see app-patch-v31.js's own
            // header) straight to the backend, so a coverPhoto/avatar another
            // user set more recently than whatever this device happened to have
            // cached locally for them shows up correctly here too, matching
            // what their own full profile page already reads live.
            window.fbDb.collection('users').limit(40).get({ source: 'server' })
                .then(function (snap) {
                    window._firestoreSuggestedUsers = snap.docs.map(function (d) {
                        var u = d.data(); u.id = d.id; return u;
                    }).filter(function (u) { return u.id && u.username; });
                    renderSuggestedUsers();
                }).catch(function (e) {
                    console.warn('[SuggestedUsers] server fetch failed (' + (e && e.message) + ') — falling back to cache/default read.');
                    // Offline or the server read genuinely failed for some other
                    // reason — better a possibly-stale card than none at all.
                    window.fbDb.collection('users').limit(40).get()
                        .then(function (snap) {
                            window._firestoreSuggestedUsers = snap.docs.map(function (d) {
                                var u = d.data(); u.id = d.id; return u;
                            }).filter(function (u) { return u.id && u.username; });
                            renderSuggestedUsers();
                        }).catch(function (e2) { console.warn('[SuggestedUsers] fallback fetch also failed:', e2 && e2.message); });
                });
        }

        /* Merge Firestore + mockUsers */
        var allUsers = Object.assign({}, window.mockUsers || {});
        (window._firestoreSuggestedUsers || []).forEach(function (u) { allUsers[u.id] = u; });

        var followedSet = us.followedUserIds instanceof Set
            ? us.followedUserIds
            : new Set(Array.isArray(us.followedUserIds) ? us.followedUserIds : []);

        // FIX (2026-08-24 — "card disappears then reappears" after Follow):
        // window._usersListener (app-fixes.js, watches the 'users' collection)
        // also calls renderSuggestedUsers() on ANY change to any of the ~50
        // watched user docs — including the followerCount increment write the
        // follow action itself makes to the followed user's doc a moment
        // later. That independent re-render can land before/racing our own
        // scheduled rebuild after the follow, so relying solely on
        // followedSet (derived from userState.followedUserIds) meant WHICH
        // render happened to run last could still show the just-followed
        // user again for one tick. window._empSuggDashboardDismissed is a
        // small, session-only, purely-additive set — the follow-btn handler
        // adds a user's id to it the instant a suggested-card follow
        // succeeds — so that user is excluded from every render of this
        // slider from then on, independent of listener timing.
        var _dismissed = window._empSuggDashboardDismissed || (window._empSuggDashboardDismissed = new Set());
        var toSuggest = Object.values(allUsers).filter(function (u) {
            return u.id !== us.id && !followedSet.has(u.id) && !_dismissed.has(u.id);
        });

        slider.innerHTML = '';

        if (toSuggest.length > 0) {
            toSuggest.slice(0, 5).forEach(function (user) {
                var cvr  = (user.coverPhoto && user.coverPhoto.startsWith('http')) ? user.coverPhoto : '';
                var av   = user.avatar
                    || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(user.fullName || 'U') + '&background=1B2B8B&color=fff&size=150');
                var flwrs = (user.followerCount || 0).toLocaleString();
                var flwing = (user.followedUserIds
                    ? (typeof user.followedUserIds.size === 'number' ? user.followedUserIds.size
                        : (Array.isArray(user.followedUserIds) ? user.followedUserIds.length : 0)) : 0).toLocaleString();
                var empy  = typeof user.empyBalance === 'number' ? user.empyBalance.toFixed(2) : '0.00';
                var bio   = user.bio ? (user.bio.length > 60 ? user.bio.substring(0, 58) + '…' : user.bio) : '';

                var card = document.createElement('div');
                card.className     = 'suggested-user-card';
                card.dataset.userId = user.id;
                card.title          = 'View ' + (user.fullName || user.username || 'profile');
                card.innerHTML =
                    '<div style="height:110px;background:'
                    + (cvr ? 'url(' + cvr + ') center/cover no-repeat' : 'linear-gradient(135deg,#e8eaf6 0%,#c5cae9 100%)')
                    + ';border-radius:14px 14px 0 0;flex-shrink:0;position:relative;"></div>'
                    + '<div style="padding:0 16px 16px;position:relative;">'
                    + '<img src="' + _attr(av) + '" alt="' + _attr(user.fullName || '') + '" loading="lazy"'
                    + ' style="width:72px;height:72px;border-radius:50%;object-fit:cover;'
                    + 'border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.15);margin-top:-36px;display:block;background:#e8eaf6;"'
                    + ' onerror="this.src=\'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.fullName || 'U') + '&background=1B2B8B&color=fff&size=150\'">'
                    + '<button class="btn follow-btn" data-user-id="' + user.id + '"'
                    + ' style="position:absolute;top:10px;right:16px;padding:8px 22px;border-radius:50px;'
                    + 'font-size:0.85rem;font-weight:700;background:transparent;'
                    + 'border:2px solid var(--primary,#1B2B8B);color:var(--primary,#1B2B8B);cursor:pointer;white-space:nowrap;">Follow</button>'
                    + '<div style="margin-top:8px;">'
                    + '<strong style="display:block;font-size:1.05rem;font-weight:800;color:var(--primary,#0A0E27);'
                    + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
                    + _esc(user.fullName || user.username || 'User') + '</strong>'
                    + '<span style="font-size:0.82rem;color:#888;display:block;margin-top:1px;">@' + _esc(user.username || '') + '</span>'
                    + (bio ? '<p style="font-size:0.85rem;color:#444;margin:8px 0 0;line-height:1.4;">' + _esc(bio) + '</p>' : '')
                    + '<div style="border-top:1px solid rgba(10,14,39,0.1);margin:12px 0;"></div>'
                    + '<div style="display:flex;gap:24px;font-size:0.85rem;color:#555;margin-bottom:8px;">'
                    + '<span><b style="font-size:1rem;font-weight:800;color:var(--primary,#0A0E27);">' + flwrs + '</b> Followers</span>'
                    + '<span><b style="font-size:1rem;font-weight:800;color:var(--primary,#0A0E27);">' + flwing + '</b> Following</span>'
                    + '</div>'
                    + '<div style="display:flex;align-items:center;gap:7px;font-size:0.9rem;color:#444;">'
                    + '<span style="font-size:1.1rem;">🏛️</span>'
                    + '<b style="font-size:1rem;font-weight:800;color:var(--primary,#0A0E27);">' + _esc(empy) + '</b>'
                    + '<span style="font-weight:600;color:#888;">EMPY</span></div>'
                    + '</div></div>';

                card.addEventListener('click', function (e) {
                    if (e.target.classList.contains('follow-btn') || e.target.closest('.follow-btn')) return;
                    window._viewingOtherProfile = (user.id !== us.id);
                    if (typeof window.renderUserProfile === 'function') window.renderUserProfile(user.id);
                    if (typeof window.navigateTo       === 'function') window.navigateTo('profile', true);
                });

                slider.appendChild(card);
            });

            container.style.display = 'block';
            if (bioCard) bioCard.style.display = 'block';
        } else {
            container.style.display = 'none';
            if (bioCard) bioCard.style.display = 'none';
        }
    }
    window.renderSuggestedUsers = renderSuggestedUsers;


    /* =========================================================================
       §7  PROFILE GALLERY HELPER
       ========================================================================= */

    /**
     * Accumulate Cloudinary URLs into the profile gallery grid.
     * Skips duplicates and blob:// URLs.
     * @param {string[]} urls
     */
    function _addUrlsToProfileGallery(urls) {
        var gallery = document.getElementById('profile-gallery');
        if (!gallery || !urls || !urls.length) return;
        urls.forEach(function (url) {
            if (!url || url.startsWith('blob:')) return;
            if (gallery.querySelector('[data-url="' + url + '"]')) return;

            var isVid = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url) || /\/video\/upload\//i.test(url);
            var item  = document.createElement('div');
            item.className      = 'gallery-item';
            item.dataset.url     = url;
            item.style.cssText   = 'position:relative;overflow:hidden;border-radius:12px;cursor:pointer;background:#f0f0f0;';
            item.innerHTML = isVid
                ? '<video src="' + url + '" style="width:100%;height:100%;object-fit:cover;" muted preload="metadata" playsinline></video>'
                : '<img src="' + url + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;"'
                    + ' onerror="this.closest(\'.gallery-item\').style.display=\'none\'">';
            gallery.appendChild(item);
        });
    }
    window._addUrlsToProfileGallery = _addUrlsToProfileGallery;


    /* =========================================================================
       §8  REEL VIEWER
       ========================================================================= */

    /**
     * Attach click handlers to reel cards and preview cards so they open
     * the full-screen reel viewer.
     * Uses MutationObserver to catch cards added dynamically.
     */
    function setupReelViewerObserver() {
        function _bindCard(card) {
            if (card._reelViewerBound) return;
            card._reelViewerBound = true;
            card.addEventListener('click', function (e) {
                /* FIX (2026-08-10): clicking the reel's own play/pause,
                   mute/unmute, or three-dot "more options" menu (button OR
                   its open dropdown) was incorrectly bubbling up to THIS
                   listener and opening the fullscreen viewer underneath the
                   person's tap — that's why pause/kebab taps looked like
                   they "expanded the screen". app-reel.js's own delegated
                   click handler already excludes these (it returns before
                   reaching its own openReelViewer() call for exactly these
                   targets), but this listener is bound directly on the card
                   itself, so it fires during the SAME bubble pass, before
                   that other handler's exclusion logic even runs. Excluding
                   the same targets here is what actually stops it. */
                /* FOLLOW-UP FIX (2026-08-10): tapping the caption/username/
                   timestamp text under the pinned card was also incorrectly
                   bubbling up to this listener and expanding the fullscreen
                   viewer, same root cause as the play/pause bug above —
                   .reel-caption-line and .reel-meta-text (the caption and
                   the username+time block) are now excluded the same way. */
                /* FOLLOW-UP FIX 2 (this session): tapping the Comment
                   button, or the profile picture / avatar+username block
                   next to it, had the exact same bug — .reel-meta-text
                   above only covers the username+timestamp text, not the
                   avatar image itself (a sibling inside .reel-meta-left,
                   not a descendant of .reel-meta-text), and the Comment
                   button (.reel-comment-btn / .reel-meta-comment-btn) was
                   never excluded at all. */
                /* FOLLOW-UP FIX 3 (this session): even with the individual
                   buttons/text excluded above, a tap landing on the plain
                   background/padding of the white info strip itself (e.g.
                   the gap between the avatar block and the Comment button)
                   still matched none of those specific selectors and fell
                   through to openReelViewer() below. Excluding the whole
                   .reel-meta-row container (a single ancestor of the
                   avatar, comment button, AND kebab wrap — a superset of
                   the individual exclusions above) closes every gap in one
                   go, so nothing in that entire white "comment card" strip
                   opens the fullscreen viewer any more. Tapping the avatar
                   still navigates to the owner's profile and tapping the
                   kebab still opens its own dropdown — both are handled by
                   their own dedicated listeners elsewhere, which this
                   exclusion doesn't touch, it only stops THIS listener's
                   fullscreen-open from also firing underneath them. */
                if (e.target.closest('.options-btn, .options-menu, .edit-post-btn, .delete-post-btn, .reel-kebab-wrap, .reel-audio-controls, .reel-caption-line, .reel-meta-row')) return;
                /* TWO-TAP FIX (this session): cards inside the main reels
                   grid (#reels-grid-container) are already handled by
                   app-reel.js's own delegated click listener, which
                   implements "first tap pins the card into the fixed
                   auto-playing spot, second tap (on the already-pinned
                   card) opens the fullscreen viewer". This listener is
                   bound directly on each card, so it fires FIRST in the
                   bubble phase — before app-reel.js's document-level
                   listener even runs — and was calling openReelViewer()
                   unconditionally on every tap, which meant the very
                   first tap on any grid thumbnail jumped straight to
                   fullscreen instead of pinning/auto-playing first.
                   Deferring entirely to app-reel.js for grid cards (this
                   listener still handles reel cards elsewhere — profile
                   galleries, dashboard previews, etc. — exactly as
                   before) fixes that without touching anything else. */
                if (card.closest('#reels-grid-container')) return;
                openReelViewer(card);
            });
        }

        document.querySelectorAll('.reel-card, .reel-preview-card, .dashboard-reel-card')
            .forEach(_bindCard);

        var obs = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                m.addedNodes.forEach(function (node) {
                    if (!node || node.nodeType !== 1) return;
                    if (node.classList && (
                        node.classList.contains('reel-card') ||
                        node.classList.contains('reel-preview-card') ||
                        node.classList.contains('dashboard-reel-card')
                    )) { _bindCard(node); }
                    node.querySelectorAll && node.querySelectorAll(
                        '.reel-card,.reel-preview-card,.dashboard-reel-card'
                    ).forEach(_bindCard);
                });
            });
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }
    window.setupReelViewerObserver = setupReelViewerObserver;

    /**
     * Open the full-screen reel viewer for a given reel card.
     * Defers to app-reel.js (empyreanReelsModule) if it has loaded,
     * since that module has the full engagement bar (like/comment/retweet/share/download).
     * This stub only runs if app-reel.js has NOT loaded yet.
     * @param {HTMLElement} clickedCard — .reel-card or .reel-preview-card
     */
    function openReelViewer(clickedCard) {
        /* If app-reel.js already registered a full openReelViewer, use it */
        if (window._empyreanReelsLoaded && window._reelViewerFull) {
            window._reelViewerFull(clickedCard);
            return;
        }

        var videoUrl = clickedCard.dataset.videoUrl
            || (clickedCard.querySelector('video') && clickedCard.querySelector('video').src)
            || '';
        if (!videoUrl || videoUrl.startsWith('blob:')) return;

        var overlay = document.getElementById('reel-viewer-modal-overlay');
        var ct      = document.getElementById('reel-viewer-container');
        if (!overlay || !ct) return;

        /* Pause every feed/page video before opening the viewer so audio does not overlap */
        document.querySelectorAll('video').forEach(function(v) {
            if (v.closest('#reel-viewer-modal-overlay, #reel-viewer-container, #go-live-modal-overlay, #live-stream-container')) return;
            try { if (!v.paused) v.pause(); } catch(e) {}
        });

        ct.innerHTML = '';
        var vi = document.createElement('div');
        vi.className      = 'reel-viewer-item';
        vi.style.cssText  = 'position:relative;width:100%;height:100%;background:#000;'
            + 'flex-shrink:0;display:flex;align-items:center;justify-content:center;';
        vi.innerHTML =
            '<video src="' + videoUrl + '" style="width:100%;height:100%;object-fit:contain;"'
            + ' controls autoplay playsinline></video>';
        ct.appendChild(vi);
        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';

        /* Wire the close button every time the viewer opens */
        var closeBtn = overlay.querySelector('.reel-viewer-close');
        if (closeBtn) {
            closeBtn.onclick = function() {
                overlay.style.display = 'none';
                document.body.style.overflow = '';
                ct.querySelectorAll('video').forEach(function(v) {
                    try { v.pause(); v.removeAttribute('src'); v.load(); } catch(e) {}
                });
                ct.innerHTML = '';
            };
        }
    }
    window.openReelViewer = openReelViewer;

    /* Also wire on DOM ready so the button works even before first reel tap */
    (function() {
        function _w() {
            var ov = document.getElementById('reel-viewer-modal-overlay');
            var cb = ov && ov.querySelector('.reel-viewer-close');
            if (!cb || cb._wired) return;
            cb._wired = true;
            cb.addEventListener('click', function() {
                ov.style.display = 'none';
                document.body.style.overflow = '';
                var ct2 = document.getElementById('reel-viewer-container');
                if (ct2) {
                    ct2.querySelectorAll('video').forEach(function(v) {
                        try { v.pause(); v.removeAttribute('src'); v.load(); } catch(e) {}
                    });
                    ct2.innerHTML = '';
                }
            });
        }
        if (document.readyState !== 'loading') _w();
        else document.addEventListener('DOMContentLoaded', _w);
        document.addEventListener('empyrean-init-done', function() { setTimeout(_w, 300); });
    })();


    /* =========================================================================
       §9  VIEW-COUNT OBSERVER
       ========================================================================= */

    /**
     * IntersectionObserver that increments view counts on post cards
     * when they scroll into view.  Only counts once per post per session.
     */
    /* NOTE: view-count Firestore writes are handled by app-fixes.js
       (_viewCountObserver). This observer only mirrors DOM counts for
       cards that app-fixes.js hasn't yet stamped with [data-obs]. */
    (function _setupViewCountObserver() {
        /* Bail out if app-fixes.js observer is already running — it owns
           the Firestore write AND the DOM update. No duplication needed. */
        if (window._viewCountObserver) return;

        var viewed = new Set();
        var obs    = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el     = entry.target;
                var postId = el.dataset.postId;
                /* Skip cards that app-fixes.js observer is already watching */
                if (!postId || viewed.has(postId) || el.dataset.obs) return;
                viewed.add(postId);
                obs.unobserve(el);
                /* DOM-only optimistic update — Firestore write is app-fixes.js's job */
                var vc = el.querySelector('.view-count');
                if (vc) vc.textContent = parseInt(vc.textContent || '0') + 1;
            });
        }, { threshold: 0.5 });

        var cardObs = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                m.addedNodes.forEach(function (node) {
                    if (!node || node.nodeType !== 1) return;
                    /* Only observe cards app-fixes.js hasn't claimed yet */
                    if (node.classList && node.classList.contains('impact-story') && !node.dataset.obs) obs.observe(node);
                    node.querySelectorAll && node.querySelectorAll('.impact-story:not([data-obs])').forEach(function (s) { obs.observe(s); });
                });
            });
        });
        cardObs.observe(document.body, { childList: true, subtree: true });

        /* Observe already-present cards not yet claimed by app-fixes.js */
        document.querySelectorAll('.impact-story:not([data-obs])').forEach(function (s) { obs.observe(s); });
    })();


    /* =========================================================================
       PRIVATE UTILITIES
       ========================================================================= */

    function _attr(str) { return String(str || '').replace(/"/g, '&quot;'); }
    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }


    /* =========================================================================
       §10  SCROLL-PAUSE OBSERVER
       =========================================================================
       Mirrors standard social-media behaviour: a feed video pauses automatically
       when it scrolls out of view and resumes only if the user had previously
       started playing it (i.e. it was not paused by the user themselves).

       Excluded: reel-viewer overlay, go-live / live-stream containers — those
       have their own lifecycle management and must never be interrupted here.
       ========================================================================= */

    (function _setupScrollPauseObserver() {

        var EXCLUDED = '#reel-viewer-modal-overlay, #reel-viewer-container, '
                     + '#go-live-modal-overlay, #live-stream-container';

        /**
         * Bind scroll-pause behaviour to a single <video> element.
         * Safe to call multiple times — guarded by _scrollPauseBound flag.
         */
        function _bindVideo(vid) {
            if (vid._scrollPauseBound) return;
            if (vid.closest && vid.closest(EXCLUDED)) return;
            vid._scrollPauseBound = true;

            /* Track whether the user intentionally started the video */
            vid._userPlaying = false;
            vid.addEventListener('play',  function() { vid._userPlaying = true;  });
            vid.addEventListener('pause', function() {
                /* Only clear the flag when the user pauses manually,
                   not when we pause programmatically via the observer. */
                if (!vid._scrollPauseInProgress) vid._userPlaying = false;
            });
        }

        /* One shared observer for all feed videos */
        var scrollObs = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                var vid = entry.target;
                if (vid.closest && vid.closest(EXCLUDED)) return;

                if (!entry.isIntersecting) {
                    /* Scrolled away — pause if playing */
                    if (!vid.paused) {
                        vid._scrollPauseInProgress = true;
                        try { vid.pause(); } catch(e) {}
                        vid._scrollPauseInProgress = false;
                        /* Remember we paused it so we can resume on scroll-back */
                        vid._pausedByScroll = true;
                    }
                } else {
                    /* Scrolled back into view — resume only if we paused it */
                    if (vid._pausedByScroll && vid._userPlaying) {
                        vid._pausedByScroll = false;
                        try { vid.play().catch(function(){}); } catch(e) {}
                    } else {
                        vid._pausedByScroll = false;
                    }
                }
            });
        }, {
            /* Pause as soon as less than 30 % of the video is visible —
               matches Instagram / TikTok feel */
            threshold: 0.3
        });

        /** Observe a video element (bind + start watching) */
        function _watchVideo(vid) {
            if (vid._scrollPauseBound) return;
            if (vid.closest && vid.closest(EXCLUDED)) return;
            _bindVideo(vid);
            scrollObs.observe(vid);
        }

        /** Sweep a DOM subtree for any video elements */
        function _sweepVideos(root) {
            (root || document).querySelectorAll('video').forEach(_watchVideo);
        }

        /* Watch for new video elements added dynamically (new posts loaded) */
        var vidMutObs = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (!node || node.nodeType !== 1) return;
                    if (node.tagName === 'VIDEO') { _watchVideo(node); return; }
                    if (node.querySelectorAll) _sweepVideos(node);
                });
            });
        });
        vidMutObs.observe(document.body, { childList: true, subtree: true });

        /* Observe videos already in the DOM */
        _sweepVideos();

        /* Also sweep after feed listeners have loaded their first batch */
        document.addEventListener('empyrean-init-done', function() {
            setTimeout(_sweepVideos, 600);
        });

        /* Expose so other modules can call _sweepVideos() after injecting content */
        window._sweepFeedVideos = _sweepVideos;

    })();


    /* ── Download count ──────────────────────────────────────────────────
       REMOVED (was double-incrementing): this used to write downloadCount
       on every .download-media-btn click, but app-fixes.js's master click
       handler (setupMasterEventListeners) ALSO writes downloadCount on the
       same click — with correct collection routing (posts / crisis_reports
       / business_posts), where this listener always hardcoded 'posts'
       regardless of the post's actual collection. Net effect: every
       download incremented the counter twice, and for non-'posts' content
       wrote to the wrong (or a nonexistent) document. app-fixes.js's write
       is now the single source of truth for this counter. */


    /* ── GLOBAL SHARE HANDLER ──────────────────────────────────────────────
       FEATURE (2026-08-01, superseded prior "always opens the OS share
       drawer" behavior) — tapping Share now opens app-patch-v50.js's
       Universal Share sheet first (Empyrean status/any chat/any group,
       WhatsApp, or "More"), instead of jumping straight to navigator.share.
       "More" inside that sheet still routes through _empShare exactly as
       before (payload.onMore below) — count + mining tracking bundled with
       the native call stays exactly as it was, this only adds the picker
       in front of it. If app-patch-v50.js hasn't loaded for some reason,
       this falls straight back through to the original direct-native-share
       behavior so Share is never a dead tap. */
    document.addEventListener('click', function (e) {
        var shareBtn = e.target && e.target.closest && e.target.closest('.share-btn, [data-action="share"], .action-btn.share-btn, #biz-share-btn, .biz-share-trigger');
        if (!shareBtn) return;

        /* Don't intercept reel share — reel module manages its own */
        if (shareBtn.closest('.reel-overlay, .reel-card, [data-reel-action]')) return;

        e.preventDefault();
        /* NOTE: do NOT call e.stopPropagation() here — it can break the
           user-gesture trust token that navigator.share() requires on Android,
           in case the "More" path below ends up calling it synchronously
           from this same click. */

        /* FIX (2026-08-22 — admin announcement posts shared a generic
           "Join the Empyrean community to view this post" card with no
           thumbnail instead of the actual announcement content/image):
           announcement cards (built by the _annRenderFeedPost listener)
           only ever get a `data-ann-id` attribute — they never carry
           data-post-id/data-biz-id/data-page-id and don't match any of
           the class names below, so `card` came back null and `postId`
           came back '', which stripped the `?post=` param off the share
           URL entirely. The OGP crawler route in server.js already knows
           how to build a proper announcement preview card (see its own
           'announcements' fallback lookup) — it just never received an
           id to look up. Adding [data-ann-id] to the selector and
           card.dataset.annId to the id fallback chain is enough; nothing
           else in this handler needs to change. */
        var card   = shareBtn.closest('[data-post-id], [data-biz-id], [data-page-id], [data-ann-id], .impact-story, .story-card, .crisis-card, .news-card, .business-card');
        var postId = card && (card.dataset.postId || card.dataset.bizId || card.dataset.pageId || card.dataset.annId || '');
        var shareUrl = window.location.origin + (postId ? '/?post=' + encodeURIComponent(postId) : window.location.pathname);

        function _goNative() {
            /* Route through _empShare (app-thread.js) — handles count + mining + native share */
            if (typeof window._empShare === 'function') { window._empShare(null, postId || null); return; }
            /* Direct fallback if thread module hasn't loaded yet */
            if (typeof navigator.share === 'function') {
                navigator.share({ title: 'Empyrean International', url: shareUrl }).catch(function (err) {
                    if (err && err.name !== 'AbortError' && navigator.clipboard) {
                        navigator.clipboard.writeText(shareUrl).then(function () {
                            if (typeof window.showNotification === 'function') window.showNotification('Link copied!', 'success');
                        }).catch(function(){});
                    }
                });
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(shareUrl).then(function () {
                    if (typeof window.showNotification === 'function') window.showNotification('Link copied!', 'success');
                }).catch(function(){});
            }
        }

        if (window.EmpShare && typeof window.EmpShare.open === 'function') {
            var media = card && card.querySelector('.story-media-container img, .story-media-container video');
            var textEl = card && card.querySelector('.story-content');
            window.EmpShare.open({
                text: textEl ? textEl.textContent.trim() : '',
                mediaUrl: media ? (media.currentSrc || media.src || '') : '',
                mediaType: media ? (media.tagName === 'VIDEO' ? 'video' : 'image') : '',
                pageUrl: shareUrl,
                onMore: _goNative
            });
            return;
        }

        _goNative();
    }, false);


    /* ═══════════════════════════════════════════════════════════════════
       NEW POSTS PILL NOTIFICATION
       Shows "↑ N new posts" when a new post arrives while the user is
       scrolled below 200px. Tapping scrolls to top and dismisses it.
    ═══════════════════════════════════════════════════════════════════ */
    (function initNewPostsPill() {
        var _newCount = 0;
        var _pill = null;

        function _getPill() {
            if (_pill) return _pill;
            _pill = document.createElement('div');
            _pill.id = 'empyrean-new-posts-pill';
            _pill.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg><span id="emp-pill-label">new posts</span>';
            document.body.appendChild(_pill);
            _pill.addEventListener('click', function () {
                _newCount = 0;
                _hide();
                /* Scroll the feed to top */
                var fc = document.getElementById('feed-container');
                var scrollTarget = (fc && fc.closest('.dashboard-section, [data-section], main, .content-area')) || window;
                if (scrollTarget === window) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
                }
                /* Also try scrolling the page wrapper */
                var pageWrap = document.querySelector('.page-content, .main-content, #app-root');
                if (pageWrap) pageWrap.scrollTo({ top: 0, behavior: 'smooth' });
            });
            return _pill;
        }

        function _show() {
            var p = _getPill();
            var label = document.getElementById('emp-pill-label');
            if (label) label.textContent = _newCount === 1 ? '1 new post' : _newCount + ' new posts';
            p.classList.add('visible');
        }

        function _hide() {
            if (_pill) _pill.classList.remove('visible');
        }

        function _isScrolledDown() {
            var fc = document.getElementById('feed-container');
            if (fc) {
                var wrap = fc.closest('.dashboard-section, [data-section], main, .content-area');
                if (wrap && wrap.scrollTop > 200) return true;
            }
            return window.scrollY > 200 || document.documentElement.scrollTop > 200;
        }

        /* Hide pill when user scrolls back to top */
        var _scrollHandler = function () {
            if (!_isScrolledDown()) { _newCount = 0; _hide(); }
        };
        window.addEventListener('scroll', _scrollHandler, { passive: true });
        document.addEventListener('scroll', _scrollHandler, { passive: true, capture: true });

        /* Expose so the posts listener can call it when a new post arrives */
        window._notifyNewPost = function () {
            if (!_isScrolledDown()) return; /* already at top — no need for pill */
            _newCount++;
            _show();
        };

        /* Hide when navigating away from dashboard */
        document.addEventListener('empyrean-section-change', function (ev) {
            if (!ev || !ev.detail || ev.detail.section !== 'dashboard') {
                _newCount = 0;
                _hide();
            }
        });
    })();


    /* Bootstrap reel viewer on load */
    document.addEventListener('empyrean-init-done', function () {
        setTimeout(setupReelViewerObserver, 400);
    });
    setTimeout(setupReelViewerObserver, 1000);


    /* =========================================================================
       ADVERT FEED INJECTOR — sponsored image/video cards, pushed from the
       admin "Advert Control Room" (app-admin.js), rotating into every
       feed a user can see.
       ─────────────────────────────────────────────────────────────────────
       WHY A MutationObserver, NOT A CHANGE TO THE POST-BUILDER ITSELF:
       This file's own #feed-container prepend logic above (SOS posts,
       crisis reports, business posts, the 8 onSnapshot listeners) is
       already spread across several code paths, and the actual initial-
       batch post cards are built by a renderer outside this file's own
       closure. Reaching into that to splice ads in at build time would
       mean either editing a function this session was never asked to
       touch, or duplicating its logic here — the same "second parallel
       layer" trap this codebase's other additive patches (v4's business-
       page injector, v33/v37's live-stream features) have already
       documented and deliberately avoided. Observing the SAME three
       containers this file already prepends into (see the existing
       ['feed-container','profile-dash-feed','profile-posts-feed'] group
       above) and inserting a sponsored card is fully additive: it never
       edits, reorders, or removes an existing post node, so nothing that
       already renders those three containers needs to know this exists.

       PLACEMENT (2026-08-08 redesign — was rotating a fresh ad card into
       the dashboard feed every EVERY_N_POSTS posts forever, i.e. an ad
       after nearly every handful of posts as the feed grew, reported as
       "adverts displaying everywhere after every post"):
         - Dashboard (#feed-container): AT MOST ONE ad card, ever, for the
           whole session — no more repeating rotation. Still triggers
           after the same EVERY_N_POSTS-th real post so it doesn't land
           awkwardly at the very top of a fresh feed.
         - Profile pages (#profile-dash-feed / #profile-posts-feed): a
           single ad card on EVERY profile (2026-08-08b: the earlier
           large-following-only gate was removed — see PLACEMENT UPDATE
           note on LARGE_FOLLOWING_THRESHOLD's old declaration below —
           since the platform doesn't yet have large-audience accounts to
           reserve this for). Triggers after the first real post rather
           than waiting for the 5th, since this placement is deliberately
           rare/prominent rather than a recurring feed rhythm, and gates
           independently PER profile visited (own gate key below) so
           browsing from one profile to another still shows one on each,
           while revisiting the same one in the same session does not
           show a second.
         - Thread comment section (#vf-th-comment-list): see the
           "COMMENT-SECTION ADVERT" block further down. One compact,
           comment-styled sponsored item per opened thread, gated by
           postId (read off #vf-th-post-area's data-postId — see the
           companion stamp added in app-thread.js's _openThread), so
           reopening the same thread never shows a second copy.

       ROTATION: adverts are weighted by their own `priority` field
       (1-10, set in the admin panel) by literally repeating each ad in
       the round-robin list `priority` times — simple, predictable, and
       needs no separate random-weighted-draw logic. Still used to pick
       WHICH ad fills each of the (now much rarer) single slots above.

       TRACKING: one impression per ad CARD INSTANCE (not per ad — the
       same ad can appear more than once as the feed grows), the first
       time it's >=50% visible, via IntersectionObserver; one click per
       tap anywhere on the card, via a single delegated listener. Both
       are best-effort increments (silently no-op if offline) — losing an
       occasional count is fine, blocking the UI on it is not.
       ========================================================================= */
    (function empyreanAdvertsFeedInjector() {
        if (window._empAdvertsInjectorLoaded) {
            console.warn('[EmpAdverts] Already loaded — skipping duplicate.');
            return;
        }
        window._empAdvertsInjectorLoaded = true;

        var ADVERTS_COL   = 'adverts';
        var EVERY_N_POSTS = 5;
        var FEED_IDS      = ['feed-container', 'profile-dash-feed', 'profile-posts-feed'];
        // PLACEMENT UPDATE (2026-08-08b): profile-page ads are no longer
        // gated behind a follower-count threshold. The platform doesn't
        // have large-following accounts yet, so a large-only gate meant
        // this placement never fired for anyone — every profile is now
        // eligible for its one ad, small and large accounts alike. The
        // per-profile gate key below still ensures each profile only ever
        // gets ONE ad card, same as before; only the eligibility check
        // changed. (_profileFollowerCountFromDOM() is left in place below
        // since nothing else needs removing — it's simply no longer
        // consulted by _containerGateKey().)

        var _ads     = [];  // round-robin list (priority-weighted, expanded)
        var _rrIndex = 0;
        var _seenImpressions = {}; // per-card-instance key -> true
        var _instanceCounter = 0;

        // containerId -> the gate key that already got its one ad card.
        // Dashboard uses a single fixed key ('dashboard') so it only ever
        // fires once total; profile containers use 'profile:<userId>' so
        // each large-following profile visited gets its own single ad
        // without one profile's ad permanently blocking every other.
        var _containerAdShownKey = {};
        // postId -> true, once the comment-section ad has been shown for
        // that thread, so re-opening/re-rendering the same thread's
        // comment list doesn't add a second copy. (Was previously
        // declared as a bare `null` — dead leftover from before this
        // block existed — instead of the keyed map its own comment
        // always described; fixed here since the block below now
        // actually uses it.)
        var _threadAdShownForPostId = {};

        function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

        function _nextAd() {
            if (!_ads.length) return null;
            var ad = _ads[_rrIndex % _ads.length];
            _rrIndex++;
            return ad;
        }

        function _injectCSS() {
            if (document.getElementById('emp-advert-css')) return;
            var css = document.createElement('style');
            css.id = 'emp-advert-css';
            css.textContent =
                '.emp-ad-card{position:relative;background:#fff;border-radius:16px;'
                + 'box-shadow:0 2px 12px rgba(10,14,39,0.08);border:1px solid rgba(10,14,39,0.07);'
                + 'margin-bottom:16px;overflow:hidden;}'
                + '.emp-ad-badge{position:absolute;top:10px;left:10px;z-index:2;'
                + 'background:rgba(10,14,39,0.62);color:#fff;font-size:0.68rem;font-weight:800;'
                + 'letter-spacing:0.04em;padding:4px 10px 4px 8px;border-radius:20px;'
                + 'backdrop-filter:blur(3px);display:flex;align-items:center;gap:5px;}'
                + '.emp-ad-media{width:100%;max-height:340px;object-fit:cover;display:block;background:#000;}'
                + '.emp-ad-body{padding:12px 14px;}'
                + '.emp-ad-advertiser{font-weight:800;font-size:0.86rem;color:#0A0E27;margin-bottom:4px;}'
                + '.emp-ad-caption{font-size:0.84rem;color:#374151;margin:0 0 10px;line-height:1.45;}'
                + '.emp-ad-cta{display:inline-flex;align-items:center;gap:6px;padding:9px 20px;'
                + 'border-radius:50px;background:linear-gradient(135deg,#1B2B8B,#5B0EA6);color:#fff;'
                + 'font-weight:700;font-size:0.82rem;text-decoration:none;}'
                /* Comment-section variant — sits inline among real replies
                   instead of as a standalone card, so it reads as "a
                   sponsored reply" rather than an interruption. Resets the
                   card chrome (.emp-ad-card gives it margin/border/shadow
                   by default) and re-shows the badge inline instead of
                   absolutely positioned over media. */
                + '.emp-ad-comment.emp-ad-card{margin:0;border:none;box-shadow:none;background:transparent;border-radius:0;}'
                + '.emp-ad-comment .emp-ad-badge-inline{position:static;display:inline-flex;align-items:center;gap:4px;'
                + 'background:rgba(27,43,139,0.08);color:#1B2B8B;font-size:0.66rem;font-weight:800;'
                + 'letter-spacing:0.03em;padding:2px 8px;border-radius:20px;margin-left:6px;backdrop-filter:none;}'
                + '.emp-ad-comment .vf-th-comment-media{margin:6px 0;border-radius:12px;overflow:hidden;}'
                + '.emp-ad-comment .vf-th-comment-media img,.emp-ad-comment .vf-th-comment-media video{'
                + 'width:100%;max-height:220px;object-fit:cover;display:block;}'
                + '.emp-ad-comment .emp-ad-cta{margin-top:8px;padding:7px 16px;font-size:0.76rem;}';
            document.head.appendChild(css);
        }

        function _renderAdCardHTML(ad) {
            var media = ad.mediaType === 'video'
                ? '<video class="emp-ad-media" src="' + _esc(ad.mediaUrl) + '" muted playsinline loop autoplay preload="metadata"></video>'
                : '<img class="emp-ad-media" src="' + _esc(ad.mediaUrl) + '" alt="' + _esc(ad.advertiserName) + '" loading="lazy">';
            return '<div class="emp-ad-card" data-ad-id="' + _esc(ad.id) + '" data-emp-ad="1">'
                + '<span class="emp-ad-badge"><i class="fas fa-bullhorn"></i> Sponsored</span>'
                + media
                + '<div class="emp-ad-body">'
                + '<div class="emp-ad-advertiser">' + _esc(ad.advertiserName) + '</div>'
                + (ad.caption ? '<p class="emp-ad-caption">' + _esc(ad.caption) + '</p>' : '')
                + (ad.linkUrl ? '<a class="emp-ad-cta" href="' + _esc(ad.linkUrl) + '" target="_blank" rel="noopener noreferrer sponsored">' + _esc(ad.ctaLabel || 'Learn More') + ' <i class="fas fa-arrow-right"></i></a>' : '')
                + '</div></div>';
        }

        function _fieldIncrement(n) {
            try {
                if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
                    return firebase.firestore.FieldValue.increment(n);
                }
            } catch (e) { /* fall through */ }
            return null;
        }
        function _bump(adId, field) {
            if (!window._firebaseLoaded || !window.fbDb || !adId) return;
            var inc = _fieldIncrement(1);
            if (!inc) return; // best-effort only — skip if FieldValue isn't available yet
            var upd = {};
            upd[field] = inc;
            window.fbDb.collection(ADVERTS_COL).doc(adId).update(upd).catch(function () { /* best-effort */ });
        }

        /* one delegated click handler covers every ad card in every
           container, present or future */
        document.addEventListener('click', function (e) {
            var card = e.target.closest ? e.target.closest('.emp-ad-card') : null;
            if (!card) return;
            _bump(card.dataset.adId, 'clicks');
        });

        var _impressionObserver = null;
        function _armImpressionObserver() {
            if (_impressionObserver || typeof IntersectionObserver === 'undefined') return;
            _impressionObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    var node = entry.target;
                    var key = node._empAdInstanceKey;
                    if (!key || _seenImpressions[key]) return;
                    _seenImpressions[key] = true;
                    _bump(node.dataset.adId, 'impressions');
                    _impressionObserver.unobserve(node);
                });
            }, { threshold: 0.5 });
        }

        function _makeAdNode(ad) {
            var wrap = document.createElement('div');
            wrap.innerHTML = _renderAdCardHTML(ad);
            var node = wrap.firstChild;
            node._empAdInstanceKey = 'ad-' + ad.id + '-' + (_instanceCounter++);
            _armImpressionObserver();
            if (_impressionObserver) _impressionObserver.observe(node);
            return node;
        }

        function _countRealPosts(container) {
            var kids = container.children, n = 0;
            for (var i = 0; i < kids.length; i++) {
                if (!kids[i].hasAttribute || !kids[i].hasAttribute('data-emp-ad')) n++;
            }
            return n;
        }

        // Reads the follower count straight off the already-rendered
        // profile header (#profile-follower-count — see app-profile.js's
        // own renderer) rather than a separate lookup, so this can never
        // disagree with what the person is already looking at, and never
        // needs to touch app-profile.js itself.
        function _profileFollowerCountFromDOM() {
            var el = document.getElementById('profile-follower-count');
            if (!el) return 0;
            var n = parseInt(String(el.textContent || '0').replace(/[^0-9]/g, ''), 10);
            return isNaN(n) ? 0 : n;
        }
        // app-profile.js stamps the viewed user's id onto
        // .profile-header-info (see its own renderUserProfile()) whether
        // it's "my profile" or someone else's — reused here as-is.
        function _currentProfileUserId() {
            var el = document.querySelector('.profile-header-info[data-user-id]');
            return el ? el.dataset.userId : null;
        }

        // Returns the gate key this container is CURRENTLY eligible for,
        // or null if it isn't eligible right now at all (e.g. a
        // small-following profile, or the profile header hasn't rendered
        // yet). null means "don't inject" — not "already shown".
        function _containerGateKey(containerId) {
            if (containerId === 'feed-container') return 'dashboard'; // one fixed key -> exactly one ad, ever, for the dashboard
            // profile-dash-feed / profile-posts-feed — every profile is
            // eligible now (see PLACEMENT UPDATE note above), regardless
            // of follower count.
            var uid = _currentProfileUserId();
            if (!uid) return null;
            return 'profile:' + uid;
        }

        // Dashboard keeps the original "after the Nth post" pacing (so it
        // never lands awkwardly at the very top of a fresh feed); a
        // qualifying profile shows its one ad after the first real post —
        // this placement is already rare (gated on follower count), so it
        // doesn't need to wait for a feed-sized rhythm, and a profile with
        // only a couple of posts should still get the chance to show one.
        function _triggerCount(containerId) {
            return containerId === 'feed-container' ? EVERY_N_POSTS : 1;
        }

        /* Called for every node newly added to an observed feed container.
           Counts only REAL posts (skips any node we ourselves inserted),
           and injects the container's ONE allowed ad once the trigger
           count is reached — a no-op forever after via the gate key. */
        function _maybeInjectAfter(container, node) {
            if (!_ads.length) return;
            if (node.hasAttribute && node.hasAttribute('data-emp-ad')) return;
            var key = _containerGateKey(container.id);
            if (!key || _containerAdShownKey[container.id] === key) return;
            var realCount = _countRealPosts(container);
            if (realCount >= _triggerCount(container.id)) {
                var ad = _nextAd();
                if (!ad) return;
                _containerAdShownKey[container.id] = key; // gate closes — no more ads in this container until the key changes (a different profile)
                var adNode = _makeAdNode(ad);
                if (node.nextSibling) container.insertBefore(adNode, node.nextSibling);
                else container.appendChild(adNode);
            }
        }

        /* One-time sweep for posts already sitting in a container at the
           moment this module attaches (e.g. a feed that finished its
           initial batch render before the observer was armed). Same gate
           as _maybeInjectAfter — at most one ad card results from this
           sweep, not one per EVERY_N_POSTS boundary crossed. */
        function _sweepExisting(container) {
            if (!container || !_ads.length) return;
            var key = _containerGateKey(container.id);
            if (!key || _containerAdShownKey[container.id] === key) return;
            var kids = Array.prototype.slice.call(container.children);
            var realSeen = 0;
            for (var i = 0; i < kids.length; i++) {
                var kid = kids[i];
                if (kid.hasAttribute && kid.hasAttribute('data-emp-ad')) continue;
                realSeen++;
                if (realSeen < _triggerCount(container.id)) continue;
                var next = kid.nextSibling;
                if (next && next.hasAttribute && next.hasAttribute('data-emp-ad')) return; // already has one
                var ad = _nextAd();
                if (!ad) return;
                _containerAdShownKey[container.id] = key;
                container.insertBefore(_makeAdNode(ad), next || null);
                return; // one ad only — stop scanning
            }
        }

        /* =====================================================================
           COMMENT-SECTION ADVERT — #vf-th-comment-list
           ─────────────────────────────────────────────────────────────────
           A single compact, comment-styled sponsored item per opened
           thread, styled to sit naturally among real replies rather than
           as a big media card. Gated by postId — read off the
           data-postId app-thread.js's _openThread stamps onto
           #vf-th-post-area (see the companion edit added there) — so
           reopening/re-rendering the same thread's comment list never
           adds a second copy, matching the postId -> shown map declared
           above. Uses the SAME ad pool/rotation (_nextAd), and the SAME
           delegated click handler + IntersectionObserver impression
           tracking already wired for .emp-ad-card above (both are
           attribute/class based, so they pick this node up for free —
           nothing to duplicate here).
           ===================================================================== */
        function _renderAdCommentHTML(ad) {
            var fallback = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(ad.advertiserName || 'Ad') + '&background=1B2B8B&color=fff&size=80';
            return '<div class="vf-th-comment-item emp-ad-card emp-ad-comment" data-ad-id="' + _esc(ad.id) + '" data-emp-ad="1">'
                + '<img class="vf-th-comment-avatar" src="' + _esc(ad.advertiserAvatar || fallback) + '" alt="' + _esc(ad.advertiserName) + '" onerror="this.src=\'' + fallback + '\'">'
                + '<div class="vf-th-comment-right">'
                +   '<div class="vf-th-comment-header">'
                +     '<span class="vf-th-comment-name">' + _esc(ad.advertiserName) + '</span>'
                +     '<span class="emp-ad-badge emp-ad-badge-inline"><i class="fas fa-bullhorn"></i> Sponsored</span>'
                +   '</div>'
                + (ad.caption ? '<p class="vf-th-comment-text">' + _esc(ad.caption) + '</p>' : '')
                + (ad.mediaUrl
                    ? '<div class="vf-th-comment-media">' + (ad.mediaType === 'video'
                        ? '<video src="' + _esc(ad.mediaUrl) + '" muted playsinline loop autoplay preload="metadata"></video>'
                        : '<img src="' + _esc(ad.mediaUrl) + '" alt="' + _esc(ad.advertiserName) + '" loading="lazy">') + '</div>'
                    : '')
                + (ad.linkUrl ? '<a class="emp-ad-cta" href="' + _esc(ad.linkUrl) + '" target="_blank" rel="noopener noreferrer sponsored">' + _esc(ad.ctaLabel || 'Learn More') + ' <i class="fas fa-arrow-right"></i></a>' : '')
                + '</div></div>';
        }

        function _makeAdCommentNode(ad) {
            var wrap = document.createElement('div');
            wrap.innerHTML = _renderAdCommentHTML(ad);
            var node = wrap.firstChild;
            node._empAdInstanceKey = 'ad-cmt-' + ad.id + '-' + (_instanceCounter++);
            _armImpressionObserver();
            if (_impressionObserver) _impressionObserver.observe(node);
            return node;
        }

        function _activeThreadPostId() {
            var area = document.getElementById('vf-th-post-area');
            return area ? (area.dataset.postId || '') : '';
        }

        // Insert one ad after the first REAL comment currently in the
        // list, if this thread hasn't had one yet and there's at least
        // one real comment to sit alongside (an ad as the very first,
        // only "reply" in an empty thread wouldn't read as natural).
        function _maybeInjectCommentAd(list) {
            if (!_ads.length) return;
            var postId = _activeThreadPostId();
            if (!postId || _threadAdShownForPostId[postId]) return;
            var kids = Array.prototype.slice.call(list.children);
            var realSeen = 0;
            for (var i = 0; i < kids.length; i++) {
                var kid = kids[i];
                if (kid.hasAttribute && kid.hasAttribute('data-emp-ad')) continue;
                realSeen++;
                if (realSeen < 1) continue;
                var next = kid.nextSibling;
                if (next && next.hasAttribute && next.hasAttribute('data-emp-ad')) return; // already has one
                var ad = _nextAd();
                if (!ad) return;
                _threadAdShownForPostId[postId] = true;
                list.insertBefore(_makeAdCommentNode(ad), next || null);
                return; // one ad only
            }
        }

        function _observeCommentList() {
            var list = document.getElementById('vf-th-comment-list');
            if (!list || list._empAdObserved) return;
            list._empAdObserved = true;
            _injectCSS();
            _maybeInjectCommentAd(list); // covers a thread already carrying comments when this attaches
            var mo = new MutationObserver(function (mutations) {
                mutations.forEach(function (m) {
                    if (!m.addedNodes || !m.addedNodes.length) return;
                    _maybeInjectCommentAd(list);
                });
            });
            mo.observe(list, { childList: true });
        }

        var _observers = {};
        function _observeContainer(id) {
            var el = document.getElementById(id);
            if (!el || _observers[id]) return;
            _injectCSS();
            _sweepExisting(el);
            var mo = new MutationObserver(function (mutations) {
                mutations.forEach(function (m) {
                    if (!m.addedNodes) return;
                    for (var i = 0; i < m.addedNodes.length; i++) {
                        var n = m.addedNodes[i];
                        if (n.nodeType === 1) _maybeInjectAfter(el, n);
                    }
                });
            });
            mo.observe(el, { childList: true });
            _observers[id] = mo;
        }
        function _observeAllFeedContainers() { FEED_IDS.forEach(_observeContainer); }

        function _loadActiveAdverts() {
            if (!window._firebaseLoaded || !window.fbDb) return;
            window.fbDb.collection(ADVERTS_COL).where('active', '==', true)
                .onSnapshot(function (snap) {
                    var fresh = [];
                    snap.forEach(function (doc) { var d = doc.data(); d.id = doc.id; fresh.push(d); });
                    /* Higher-priority ads appear more often — expand each ad
                       into the rotation list `priority` times (min 1) rather
                       than a separate weighted-random draw, so the rotation
                       stays predictable and easy to reason about. */
                    var expanded = [];
                    fresh.forEach(function (ad) {
                        var weight = Math.max(1, Math.min(10, parseInt(ad.priority, 10) || 1));
                        for (var i = 0; i < weight; i++) expanded.push(ad);
                    });
                    _ads = expanded;
                    _rrIndex = 0;
                }, function (err) {
                    console.warn('[EmpAdverts] listener error:', err.message);
                });
        }

        function _boot() {
            _loadActiveAdverts();
            _observeAllFeedContainers();
            _observeCommentList();
        }
        document.addEventListener('empyrean-init-done', function () { setTimeout(_boot, 600); });
        document.addEventListener('empyrean-section-change', function () { setTimeout(_observeAllFeedContainers, 400); });
        // The thread panel's #vf-th-comment-list div exists once in the DOM
        // from initial page load (app-thread.js builds it as part of the
        // fixed overlay markup, not per-open) and is just cleared/refilled
        // each time a thread opens — one attach here is enough; the
        // MutationObserver above then reacts to whatever's opened, with the
        // postId gate above distinguishing between different threads.
        document.addEventListener('empyrean-init-done', function () { setTimeout(_observeCommentList, 800); });
        if (document.readyState !== 'loading') setTimeout(_boot, 1500);
        else document.addEventListener('DOMContentLoaded', function () { setTimeout(_boot, 1500); });

        console.log('[EmpAdverts] \u2705 Advert feed injector armed \u2014 sponsored cards from Firestore "adverts" (active==true) rotate into feed-container/profile-dash-feed/profile-posts-feed/vf-th-comment-list, weighted by priority.');
    })();


    console.log('[EmpFeed] ✅ Feed module ready — post builder, 8 listeners, dashboard widgets loaded.');

})();