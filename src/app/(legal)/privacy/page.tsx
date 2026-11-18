import { Contact, LegalPage } from "../LegalPage";

export const metadata = { title: "Privacy policy · CrowdMap" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        CrowdMap is a student project (IIM Indore web development course) that shows how crowded places
        are right now. This page explains what we collect, why, and what you can do about it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your email address and display name. If you sign in with Google we receive
          your name and email from Google, nothing else (no contacts, files or calendar).</li>
        <li><strong>Location, only when you act:</strong> when you report a crowd level, post an alert, upload media,
          add or confirm a place, we take a few GPS readings to check you are really there; that check is kept
          with the action so fake reports can be spotted. If you switch on
          &ldquo;share my location&rdquo;, your latest position is sent about once a minute while the site is open;
          it counts for 10 minutes and is deleted after 1 hour. Only per-place counts are kept long term.</li>
        <li><strong>What you post:</strong> crowd reports, alerts, visit plans, places you add, photos, videos,
          audio clips and comments. Photos are re-drawn in your browser before upload, which removes hidden
          location data from the file.</li>
        <li><strong>Security records:</strong> every action (including failed logins and rejected reports) is written
          to an audit log with the time and your account, and login attempts record your IP address. This
          is how we detect bots and abuse.</li>
        <li><strong>Cookies:</strong> only what is needed to keep you logged in and remember your language. No
          advertising or tracking cookies.</li>
      </ul>

      <h2>Who can see what</h2>
      <ul>
        <li>Everyone sees crowd levels, alert types, and uploads and comments with your display name.</li>
        <li>Nobody else sees your email, your location readings, or which alerts or reports are yours.</li>
        <li>The two site admins can see account details and the audit log to moderate content and remove bots.</li>
        <li>We never sell your data or show ads.</li>
      </ul>

      <h2>Services we use</h2>
      <p>
        Supabase (database, login and file storage, servers in Singapore), Vercel (hosting), Cloudflare
        Turnstile (bot check on login and sign-up), Google (only if you choose Google sign-in), OpenFreeMap /
        OpenStreetMap (map tiles) and Open-Meteo (weather). They process data only to provide those services.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>See, change and delete your reports, alerts, plans, places, uploads and comments on
          <strong> My activity</strong>; change your name and language there too.</li>
        <li>Location sharing is off unless you turn it on, and you can turn it off at any time.</li>
        <li>To delete your account, <Contact />. Your posts are deleted with it. Entries in the audit log
          cannot be edited or deleted by anyone; that is what makes the log trustworthy.</li>
      </ul>

      <h2>Questions</h2>
      <p>For anything about your data, <Contact />.</p>
    </LegalPage>
  );
}
