import type { Messages } from "@/lib/i18n";

export const messages = {
  en: {
    mapLabel: "Crowd map",
    noData: "no crowd data yet",
    locate: "Show my location",
    "locate.denied": "Location permission was denied.",
    "locate.unsupported": "This browser cannot share location.",
    "level.empty": "Empty",
    "level.quiet": "Quiet",
    "level.moderate": "Moderate",
    "level.busy": "Busy",
    "level.packed": "Packed",
  },
  hi: {
    mapLabel: "भीड़ का नक्शा",
    noData: "अभी भीड़ की जानकारी नहीं",
    locate: "मेरी जगह दिखाएँ",
    "locate.denied": "लोकेशन की अनुमति नहीं मिली।",
    "locate.unsupported": "यह ब्राउज़र लोकेशन नहीं दे सकता।",
    "level.empty": "खाली",
    "level.quiet": "शांत",
    "level.moderate": "मध्यम",
    "level.busy": "व्यस्त",
    "level.packed": "खचाखच",
  },
} satisfies Messages;
