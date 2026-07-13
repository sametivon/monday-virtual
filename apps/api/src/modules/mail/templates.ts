/**
 * Transactional email templates (C1). Plain TS string builders — no template
 * engine, no remote assets. The shell wears the product identity (warm paper,
 * ink text, violet accent, serif display headings) and renders safely in every
 * client: single-column, inline styles only, system font stacks.
 */

export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

const PAPER = '#faf7f2';
const CARD = '#ffffff';
const INK = '#211c29';
const INK_SOFT = 'rgba(33,28,41,0.68)';
const LINE = 'rgba(33,28,41,0.12)';
const VIOLET = '#6c5ce7';
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** One shell for every mail: wordmark, white card, quiet footer. */
function shell(productName: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${PAPER};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
            <tr>
              <td style="padding:0 4px 18px;font-family:${SERIF};font-size:20px;color:${INK};">
                ${escapeHtml(productName)}
              </td>
            </tr>
            <tr>
              <td style="background:${CARD};border:1px solid ${LINE};border-radius:16px;padding:36px 36px 32px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${INK_SOFT};">
                Sent by ${escapeHtml(productName)} — your team's virtual office inside monday.com.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 14px;font-family:${SERIF};font-weight:500;font-size:26px;line-height:1.25;color:${INK};">${escapeHtml(text)}</h1>`;
}

function para(html: string): string {
  return `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.65;color:${INK};">${html}</p>`;
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;"><tr>
    <td style="border-radius:12px;background:${VIOLET};">
      <a href="${escapeAttr(url)}" style="display:inline-block;padding:12px 26px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>
    </td>
  </tr></table>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 0;font-family:${SANS};font-size:13px;color:${INK_SOFT};width:96px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:7px 0;font-family:${SANS};font-size:14px;color:${INK};">${escapeHtml(value)}</td>
  </tr>`;
}

// ── Templates ────────────────────────────────────────────────────────────────

export function welcomeMail(input: {
  productName: string;
  userName: string;
  appUrl: string;
}): MailContent {
  const first = firstName(input.userName);
  const html = shell(
    input.productName,
    [
      heading(`Welcome, ${first}`),
      para(
        `Your team now has a shared office — walk over to someone to talk, present on the big screen, sketch on whiteboards, and keep monday boards on the walls.`,
      ),
      para(
        `You'll find it in monday.com, or open it directly:`,
      ),
      button('Step inside', input.appUrl),
    ].join('\n'),
  );
  return {
    subject: `Welcome to ${input.productName}`,
    html,
    text: [
      `Welcome, ${first}`,
      ``,
      `Your team now has a shared office — walk over to someone to talk, present on the big screen, sketch on whiteboards, and keep monday boards on the walls.`,
      ``,
      `Step inside: ${input.appUrl}`,
    ].join('\n'),
  };
}

export function rsvpMail(input: {
  productName: string;
  userName: string;
  eventTitle: string;
  startsAt: Date;
  endsAt: Date;
  appUrl: string;
}): MailContent {
  const when = formatWhen(input.startsAt, input.endsAt);
  const html = shell(
    input.productName,
    [
      heading(`You're registered`),
      para(`You have a seat at <strong>${escapeHtml(input.eventTitle)}</strong>.`),
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};width:100%;">
        ${detailRow('When', when)}
        ${detailRow('Where', `${input.productName} — Auditorium`)}
      </table>`,
      para(`A calendar invite is attached. We'll also send a reminder shortly before it starts.`),
      button('Open the event', input.appUrl),
    ].join('\n'),
  );
  return {
    subject: `Registered: ${input.eventTitle}`,
    html,
    text: [
      `You're registered for ${input.eventTitle}.`,
      ``,
      `When: ${when}`,
      `Where: ${input.productName} — Auditorium`,
      ``,
      `Open the event: ${input.appUrl}`,
    ].join('\n'),
  };
}

export function reminderMail(input: {
  productName: string;
  eventTitle: string;
  startsAt: Date;
  appUrl: string;
}): MailContent {
  const time = formatTime(input.startsAt);
  const html = shell(
    input.productName,
    [
      heading(`Starting soon`),
      para(
        `<strong>${escapeHtml(input.eventTitle)}</strong> begins at ${escapeHtml(time)} — grab a seat in the auditorium.`,
      ),
      button('Join now', input.appUrl),
    ].join('\n'),
  );
  return {
    subject: `Starting soon: ${input.eventTitle}`,
    html,
    text: [`${input.eventTitle} begins at ${time}.`, ``, `Join: ${input.appUrl}`].join('\n'),
  };
}

/** Minimal RFC 5545 invite so the RSVP lands on the registrant's calendar. */
export function eventIcs(input: {
  uid: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  url: string;
  productName: string;
}): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${icsEscape(input.productName)}//EN`,
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(input.uid)}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(input.startsAt)}`,
    `DTEND:${icsDate(input.endsAt)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    `DESCRIPTION:Join in ${icsEscape(input.productName)}: ${icsEscape(input.url)}`,
    `URL:${icsEscape(input.url)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// ── helpers ──────────────────────────────────────────────────────────────────

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

function formatWhen(start: Date, end: Date): string {
  const day = start.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${day}, ${formatTime(start)} – ${formatTime(end)} (UTC)`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
