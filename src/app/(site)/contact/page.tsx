import Link from "next/link";
import { InfoCard, InfoPage } from "../InfoPage";

export const metadata = { title: "Contact · CrowdMap" };

const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;

export default function ContactPage() {
  return (
    <InfoPage title="Contact" intro="Questions, feedback, or a place that's wrong on the map? We'd like to hear it.">
      <InfoCard i={0} label="Write to us">
        <h2>Get in touch</h2>
        {email
          ? <p>Email <a href={`mailto:${email}`} className="text-[#5ab8ff] underline underline-offset-4">{email}</a>. We usually reply within two days.</p>
          : <p>Reach the CrowdMap team through the IIM Indore web development course.</p>}
      </InfoCard>
      <InfoCard i={1} label="Fix the map">
        <h2>Something wrong on the map?</h2>
        <ul>
          <li>A missing place: stand at it and use Add place on the map.</li>
          <li>A place that doesn&rsquo;t exist: open it and tap &ldquo;Doesn&rsquo;t exist&rdquo; if it&rsquo;s waiting for confirmation.</li>
          <li>A wrong crowd level: if you&rsquo;re there, report the real level. Live reports replace estimates.</li>
        </ul>
      </InfoCard>
      <InfoCard i={2} label="Privacy">
        <h2>Your data</h2>
        <p>
          See the <Link href="/privacy" className="text-[#5ab8ff] underline underline-offset-4">privacy policy</Link>. You can delete your
          account and everything you posted from My activity at any time.
        </p>
      </InfoCard>
    </InfoPage>
  );
}
