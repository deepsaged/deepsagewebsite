
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('consent', 'default', {
      'analytics_storage': 'denied',
      'ad_storage': 'denied',
      'ad_user_data': 'denied',
      'ad_personalization': 'denied',
    });
    window.dsLoadAnalytics = function dsLoadAnalytics() {
      if (window.dsAnalyticsLoaded) return;
      window.dsAnalyticsLoaded = true;
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=G-33MSQXQ8G9';
      document.head.appendChild(script);
      gtag('js', new Date());
      gtag('config', 'G-33MSQXQ8G9');
    };

    window.dsAnalyticsConsent = false;
    window.dsTrack = function (name, params) {
      if (!window.dsAnalyticsConsent) return;
      gtag('event', name, params || {});
    };
  