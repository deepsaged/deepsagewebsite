
    import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
    import {
      getAuth,
      GoogleAuthProvider,
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      signOut,
      onAuthStateChanged,
      signInWithPopup,
      getAdditionalUserInfo,
    } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
    import {
      getFirestore,
      doc,
      setDoc,
      getDoc,
      serverTimestamp,
    } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

    const firebaseConfig = {
      apiKey: "AIzaSyAjiW7UXat-UHZBFCBXhZdlPz64Zpwkjbo",
      authDomain: "deepsage-aac5a.firebaseapp.com",
      projectId: "deepsage-aac5a",
      storageBucket: "deepsage-aac5a.firebasestorage.app",
      messagingSenderId: "10532051582",
      appId: "1:10532051582:web:029846f62f0edd01f3162f",
      measurementId: "G-33MSQXQ8G9",
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const firestoreDb = getFirestore(app);
    const gProvider = new GoogleAuthProvider();

    // Best-effort, client-reported IP lookup (not server-verified -- a
    // Worker-side capture via CF-Connecting-IP would be more accurate/
    // harder to spoof, but that needs a new oauth.deepsage.com endpoint,
    // out of scope here). Only called at the moment of signup, never on
    // every pageview, to keep the third-party call and its privacy exposure
    // minimal. Degrades to null on any failure (offline, service down,
    // blocked by an ad-blocker) rather than breaking signup.
    async function fetchClientIp() {
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        if (!res.ok) return null;
        const data = await res.json();
        return data.ip || null;
      } catch (err) {
        return null;
      }
    }

    // Writes a users/{uid} Firestore doc the first time an account is
    // created (email/password signup, or first-ever Google sign-in) -- the
    // "join wishlist" moment. Attribution fields (UTM params, referrer,
    // landing page, first-visit time, IP address, signup page, user agent)
    // are only included if the visitor has granted analytics cookie
    // consent, mirroring promoteStagedReferralIfConsented()'s own consent
    // gate -- these ds_pending_* keys are never written to localStorage in
    // the first place unless consent was already granted, so this check is
    // a second confirmation, not the only one.
    async function recordUserSignup(user, isNewUser) {
      if (!isNewUser) return;
      try {
        const data = {
          email: user.email || null,
          displayName: user.displayName || null,
          createdAt: serverTimestamp(),
        };
        if (window.dsAnalyticsConsent) {
          data.referralCode = localStorage.getItem('ds_pending_ref') || null;
          data.utmSource = localStorage.getItem('ds_pending_utm_source') || null;
          data.utmMedium = localStorage.getItem('ds_pending_utm_medium') || null;
          data.utmCampaign = localStorage.getItem('ds_pending_utm_campaign') || null;
          data.utmContent = localStorage.getItem('ds_pending_utm_content') || null;
          data.referrerUrl = localStorage.getItem('ds_pending_referrer') || null;
          data.landingPage = localStorage.getItem('ds_pending_landing') || null;
          data.firstVisitAt = localStorage.getItem('ds_pending_first_visit_at') || null;
          data.signupPage = window.location.pathname;
          data.userAgent = navigator.userAgent;
          data.ipAddress = await fetchClientIp();
        }
        await setDoc(doc(firestoreDb, "users", user.uid), data, { merge: true });
        localStorage.removeItem('ds_pending_ref');
        localStorage.removeItem('ds_pending_utm_source');
        localStorage.removeItem('ds_pending_utm_medium');
        localStorage.removeItem('ds_pending_utm_campaign');
        localStorage.removeItem('ds_pending_utm_content');
        localStorage.removeItem('ds_pending_referrer');
        localStorage.removeItem('ds_pending_landing');
        localStorage.removeItem('ds_pending_first_visit_at');
      } catch (err) {
        // Non-fatal: Firebase Auth already succeeded and remains the source
        // of truth for the account existing. A failure here is most likely
        // a Firestore security rules issue on the `users` collection.
        console.error("Failed to record user signup:", err);
      }
    }

    // Reads the logged-in user's stored language preference, if any.
    // Returns null on any failure (missing doc, security-rule denial, etc.)
    // so callers can fall back to weaker signals rather than erroring.
    async function getPreferredLang(uid) {
      try {
        const snap = await getDoc(doc(firestoreDb, "users", uid));
        return snap.exists() ? (snap.data().preferredLang || null) : null;
      } catch (err) {
        console.error("Failed to read language preference:", err);
        return null;
      }
    }

    async function setPreferredLang(uid, lang) {
      await setDoc(doc(firestoreDb, "users", uid), { preferredLang: lang }, { merge: true });
    }

    window._sf = {
      auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
      onAuthStateChanged, gProvider, signInWithPopup, getAdditionalUserInfo,
      recordUserSignup, getPreferredLang, setPreferredLang,
    };
    window.dsRecordUserSignup = recordUserSignup;

    onAuthStateChanged(auth, user => {
      const signedOut = document.getElementById("header-auth-out");
      const signedIn = document.getElementById("header-auth-in");
      const nameEl = document.getElementById("header-auth-name");
      const banner = document.getElementById("topBanner");
      if (!signedOut || !signedIn) return;
      if (user) {
        signedOut.style.display = "none";
        signedIn.style.display = "flex";
        nameEl.textContent = user.displayName || user.email || window.dsUiStrings.explorer_fallback;
        if (banner) banner.style.display = "none";
      } else {
        signedOut.style.display = "flex";
        signedIn.style.display = "none";
        if (banner) banner.style.display = "flex";
      }
      if (window.dsOnAuthReady) window.dsOnAuthReady(user);
    });
  