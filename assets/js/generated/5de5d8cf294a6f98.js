
    (function () {
      var REF_COOKIE = 'ds_ref_staged';

      function getCookie(name) {
        var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : null;
      }

      function stageReferralCookie() {
        if (getCookie(REF_COOKIE)) return; // first-touch only
        var params = new URLSearchParams(location.search);
        var hasSignal = params.get('utm_source') || params.get('utm_medium') ||
          params.get('utm_campaign') || params.get('utm_content') || params.get('ref') || document.referrer;
        if (!hasSignal) return; // nothing worth staging on a plain internal navigation
        var data = {
          ref: params.get('ref') || '',
          utm_source: params.get('utm_source') || '',
          utm_medium: params.get('utm_medium') || '',
          utm_campaign: params.get('utm_campaign') || '',
          utm_content: params.get('utm_content') || '',
          referrer: document.referrer || '',
          landing: location.pathname,
          first_visit_at: new Date().toISOString(),
        };
        document.cookie = REF_COOKIE + '=' + encodeURIComponent(JSON.stringify(data)) +
          '; path=/; max-age=' + (180 * 24 * 60 * 60) + '; SameSite=Lax';
      }
      stageReferralCookie();

      window.dsGetCookie = getCookie;
      window.dsDeleteCookie = function (name) {
        document.cookie = name + '=; path=/; max-age=0; SameSite=Lax';
      };
    })();
  