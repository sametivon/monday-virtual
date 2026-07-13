/**
 * Shared landing-page content. Kept in one place so the visible copy and the
 * JSON-LD structured data (FAQPage) stay in sync — which is what search engines
 * and AI answer engines reward. Written in natural language for AEO, with the
 * target keywords woven in rather than stuffed.
 */

export interface Faq {
  q: string;
  a: string;
}

export const FAQ: Faq[] = [
  {
    q: 'What is MondayVirtual?',
    a: 'MondayVirtual is a 3D virtual office and meeting space that runs inside monday.com. Your team joins as avatars, holds virtual meetings with proximity voice and video, presents in an auditorium, and sees live monday.com boards on the walls — all in the browser, with no separate app to install.',
  },
  {
    q: 'How do virtual meetings work inside monday.com?',
    a: 'Open MondayVirtual from your monday.com account and everyone lands in the same 3D space. Walk your avatar next to a colleague to start talking instantly, gather a group at a table for a huddle, or fill the auditorium for a company all-hands with screen sharing. Because it lives inside monday.com, there is no extra login or meeting link.',
  },
  {
    q: 'Is MondayVirtual a replacement for Zoom, Teams or Google Meet?',
    a: 'It is a spatial meeting and collaboration layer, not a like-for-like video call. For scheduled 1:1 calls people may still use Zoom or Teams; MondayVirtual is built for spontaneous conversations, hybrid team presence, all-hands events and virtual offices — with proximity audio, video conferencing and screen sharing built in.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No downloads and no new accounts. MondayVirtual runs in the browser as a monday.com app, and your team is already signed in through monday.',
  },
  {
    q: 'Can my team see monday.com boards during a meeting?',
    a: 'Yes. Live monday.com boards render on the walls and screens of the space — status, owners and KPIs update from the same data you already use, so stand-ups and reviews happen right in front of the board.',
  },
  {
    q: 'How many people can join a meeting or event?',
    a: 'Small huddles are a handful of people; the company auditorium holds a full all-hands with hundreds of seats and screen sharing to the entire room.',
  },
  {
    q: 'Is MondayVirtual good for remote and hybrid teams?',
    a: 'Yes — it is built for remote and hybrid work. It gives distributed teams a shared place to actually be together, with proximity voice and video, so collaboration feels spontaneous instead of scheduled.',
  },
  {
    q: 'How much does MondayVirtual cost?',
    a: 'Pricing is per seat, per month: €8 Team, €14 Company (with the auditorium and white-label branding), and custom Enterprise pricing. Every plan is billed for the people who show up, with no per-minute meeting fees.',
  },
];

/**
 * Early-access feedback — clearly labeled as beta-program quotes until real
 * customer stories replace them (never invent named companies/logos).
 */
export const TESTIMONIALS: { quote: string; name: string; role: string; accent: string }[] = [
  {
    quote: 'Our 9:30 stand-up went from half an hour to four minutes. We gather at the board and just go.',
    name: 'Ops lead',
    role: '40-person team · early access',
    accent: '#6c5ce7',
  },
  {
    quote: 'First time my remote hires said the company finally feels like somewhere.',
    name: 'Founder',
    role: 'Fully-remote SaaS · early access',
    accent: '#0a9a6e',
  },
  {
    quote: 'The boards on the wall are the thing nobody expected to love. We run reviews in there now.',
    name: 'Product manager',
    role: 'monday.com power user · early access',
    accent: '#d0716d',
  },
];

export type Mark = boolean | 'partial';

export const COMPARISON: {
  columns: [string, string, string];
  rows: { label: string; marks: [Mark, Mark, Mark] }[];
} = {
  columns: ['MondayVirtual', 'Video calls (Zoom / Teams)', 'Other virtual offices'],
  rows: [
    { label: 'Runs inside monday.com', marks: [true, false, false] },
    { label: 'Live monday.com boards in the room', marks: [true, false, false] },
    { label: 'Proximity “walk-over” voice & video', marks: [true, false, 'partial'] },
    { label: 'Company-wide auditorium & events', marks: [true, 'partial', 'partial'] },
    { label: 'Spontaneous, unscheduled meetings', marks: [true, false, 'partial'] },
    { label: 'No separate app or login', marks: [true, false, false] },
    { label: 'Screen-share to a whole room', marks: [true, true, 'partial'] },
    { label: 'Set up in minutes', marks: [true, true, false] },
  ],
};
