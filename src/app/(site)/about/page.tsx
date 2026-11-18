import { InfoCard, InfoPage } from "../InfoPage";

export const metadata = { title: "About · CrowdMap" };

export default function AboutPage() {
  return (
    <InfoPage title="About CrowdMap" intro="A live map of how crowded places are, so you can pick the right time to go.">
      <InfoCard i={0} label="01 · Why">
        <h2>Why we built it</h2>
        <p>
          Traffic maps tell you how busy the roads are. Nothing tells you how busy the temple, the market or your
          favourite street food corner is. You only find out when you get there. CrowdMap fixes that with one simple
          signal: how crowded a place is right now.
        </p>
      </InfoCard>
      <InfoCard i={1} label="02 · Data">
        <h2>Where the numbers come from</h2>
        <ul>
          <li>People at the place tap one of five levels, from Empty to Packed. We check their phone&rsquo;s location first.</li>
          <li>People who share their location show up as a live count, the way traffic apps see cars on a road.</li>
          <li>Quick alerts such as a long queue, waterlogging or a road block nudge the level up or down.</li>
          <li>When nobody has reported recently, we show an estimate from the place&rsquo;s usual pattern for that hour, and label it clearly.</li>
        </ul>
      </InfoCard>
      <div className="grid gap-5 sm:grid-cols-2">
        <InfoCard i={2} label="03 · Trust" className="h-full">
          <h2>Keeping it honest</h2>
          <p>
            Every report needs a real location check, accounts that behave like bots are removed automatically, and
            every action is written to a log that nobody can edit, admins included. Photos and clips must be recorded
            live at the place.
          </p>
        </InfoCard>
        <InfoCard i={3} label="04 · Us" className="h-full">
          <h2>Who we are</h2>
          <p>CrowdMap is a student project from IIM Indore. It started in Indore, Delhi and Mumbai and now covers cities across India.</p>
        </InfoCard>
      </div>
    </InfoPage>
  );
}
