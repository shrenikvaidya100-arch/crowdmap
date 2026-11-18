import { Contact, LegalPage } from "../LegalPage";

export const metadata = { title: "Terms of use · CrowdMap" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <p>
        CrowdMap is a free student project (IIM Indore web development course). By using it you agree to
        these terms.
      </p>

      <h2>Using CrowdMap</h2>
      <ul>
        <li>Report only what you see yourself, at the place, right now. Reports need your GPS location.</li>
        <li>Post only media you recorded yourself. No faces of people who didn&rsquo;t agree, no private
          information, nothing illegal, hateful, sexual or violent.</li>
        <li>No spam, fake reports, fake places, automated accounts, or attempts to fool the location checks.</li>
        <li>One account per person.</li>
      </ul>

      <h2>Moderation</h2>
      <p>
        Accounts that look automated are removed automatically, and admins can hide content or remove accounts
        that break these rules. Removals are logged and can be reversed if they were a mistake: <Contact />.
      </p>

      <h2>No guarantees</h2>
      <p>
        Crowd levels, forecasts, weather and alerts come from other users and estimates. They can be wrong or
        out of date. Use your own judgement, especially for safety, and follow local authorities. CrowdMap is
        provided as is, without any warranty, and may change or stop at any time.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of what you post. By posting it you let CrowdMap show it to other users on the site.
        You can delete it any time from My activity.
      </p>

      <p>See also the <a href="/privacy" className="text-blue-600 underline">privacy policy</a>.</p>
    </LegalPage>
  );
}
