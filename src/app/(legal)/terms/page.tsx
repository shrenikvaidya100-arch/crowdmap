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

      <h2 id="uploads">Photos and videos you upload</h2>
      <ul>
        <li>You are responsible for every photo, video and clip you upload, and for having the right to share it.</li>
        <li>Don&rsquo;t upload anything that shows other people&rsquo;s faces without their consent, private information,
          or anything illegal. If an upload causes a complaint or legal claim, you are responsible for it, not CrowdMap.</li>
        <li>Uploads can be reported by others and hidden or removed by admins. Removals are logged.</li>
      </ul>

      <h2 id="location">Your location</h2>
      <ul>
        <li>When you report a crowd level, post an alert or upload media, your phone&rsquo;s location is checked to
          confirm you are really at the place.</li>
        <li>Locations and reports, without your name, are also used to improve the maps: crowd patterns,
          forecasts, and places that are missing or in the wrong spot.</li>
        <li>Sharing your live location on the map is optional and can be turned off any time.</li>
      </ul>

      <h2>Accepting these terms</h2>
      <p>
        You accept these terms by ticking the box when you create an account. We keep the date you accepted
        them with your account.
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
