// Notification wording, shared by the inbox (browser) and push messages (server).
import type { Language } from "@/lib/config";

export type NotificationData = {
  place_name?: string; place_name_hi?: string | null; level?: number | null; source?: "live" | "estimated";
  target_level?: number;
};

const LEVEL = {
  en: ["", "empty", "quiet", "moderate", "busy", "packed"],
  hi: ["", "खाली", "शांत", "सामान्य", "व्यस्त", "बहुत भीड़"],
};

export function notificationText(kind: string, data: NotificationData, lang: Language) {
  const name = (lang === "hi" && data.place_name_hi) || data.place_name || "";
  const level = LEVEL[lang][data.level ?? 0] ?? "";
  if (kind === "place_quiet") {
    const est = data.source === "estimated";
    return lang === "hi"
      ? { title: `${name} अब ${level} है`, body: est ? "आम तौर पर इस समय भीड़ कम रहती है (अनुमान)। अभी जाने का अच्छा समय है।" : "लोगों की ताज़ा रिपोर्ट के अनुसार। अभी जाने का अच्छा समय है।" }
      : { title: `${name} is ${level} now`, body: est ? "Usually quiet at this time (estimate). A good time to go." : "Based on live reports from people there. A good time to go." };
  }
  if (kind === "confirm_crowd") {
    return lang === "hi"
      ? { title: `क्या ${name} में अभी भीड़ है?`, body: `पास में किसी ने इसे ${level} बताया। आप वहीं हैं तो एक टैप में पुष्टि करें।` }
      : { title: `Is ${name} crowded right now?`, body: `Someone there says it's ${level}. You're nearby: tap to confirm or correct it.` };
  }
  return lang === "hi"
    ? { title: `${name}: अलर्ट समाप्त`, body: "आपके चुने समय में भीड़ कम नहीं हुई।" }
    : { title: `${name}: alert ended`, body: "It didn't get quiet in the time you picked." };
}
