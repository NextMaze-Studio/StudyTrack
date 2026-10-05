/* ============================================================
   StudyFlow — Firebase configuration
   ============================================================

   HOW TO ENABLE THE CLOUD (real unique usernames + global leaderboard):

   1. Go to https://console.firebase.google.com and create a free project.
   2. In the left menu open "Build" > "Authentication" > Get started.
      - Under "Sign-in method" enable "Email/Password".
   3. Open "Build" > "Firestore Database" > Create database (production mode).
      - Then paste the rules from `firestore.rules` into the Rules tab and Publish.
   4. Project settings (gear icon) > scroll to "Your apps" > Web app (</>).
      - Register an app and copy the `firebaseConfig` values here.
   5. Authentication > Settings > "Authorized domains" > add your GitHub Pages
      domain (e.g. yourname.github.io).

   Until this config is filled in, the site automatically runs in
   ON-DEVICE mode (everything saved in this browser only, leaderboard shows
   only users created on this device). Fill the values below and reload to
   switch on the cloud.
   ============================================================ */

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/* Internal: the fake email domain used to turn "username + password"
   into a Firebase email/password account (Firebase requires an email). */
export const USERNAME_EMAIL_DOMAIN = "studyflow.app";
