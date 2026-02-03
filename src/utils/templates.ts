import { GroupInvite, Language } from '../types';

interface Templates {
  personal: (name: string, groups: GroupInvite[]) => string;
  group: (inviteLink: string) => string;
  nudge: (name: string, groupNames: string[]) => string;
}

const templates: Record<Language, Templates> = {
  nl: {
    personal: (name: string, groups: GroupInvite[]) =>
      `Hey ${name}! 👋

We stappen over van WhatsApp naar Signal voor een aantal groepen.
Hier zijn je uitnodigingslinks:

${groups.map((g) => `• ${g.name} → ${g.inviteLink}`).join('\n')}

Installeer Signal als je het nog niet hebt: https://signal.org/install
Tot daar! 🙌`,

    group: (inviteLink: string) =>
      `📢 Deze groep verhuist naar Signal!

Klik hier om lid te worden: ${inviteLink}

Installeer Signal: https://signal.org/install`,

    nudge: (name: string, groupNames: string[]) =>
      `Hey ${name}! 👋

${groupNames.length === 1 ? `Onze groep "${groupNames[0]}" is bijna klaar` : `Onze groepen ${groupNames.map((n) => `"${n}"`).join(', ')} zijn bijna klaar`} om over te stappen naar Signal — je bent een van de laatsten die het nog niet heeft geïnstalleerd.

Download het hier: https://signal.org/install

Zodra je het hebt, kunnen we allemaal overstappen! 🙌`,
  },

  en: {
    personal: (name: string, groups: GroupInvite[]) =>
      `Hey ${name}! 👋

We're switching from WhatsApp to Signal for some groups.
Here are your invite links:

${groups.map((g) => `• ${g.name} → ${g.inviteLink}`).join('\n')}

Install Signal if you haven't yet: https://signal.org/install
See you there! 🙌`,

    group: (inviteLink: string) =>
      `📢 This group is moving to Signal!

Join here: ${inviteLink}

Install Signal: https://signal.org/install`,

    nudge: (name: string, groupNames: string[]) =>
      `Hey ${name}! 👋

${groupNames.length === 1 ? `Our group "${groupNames[0]}" is almost ready` : `Our groups ${groupNames.map((n) => `"${n}"`).join(', ')} are almost ready`} to move to Signal — you're one of the last people who hasn't installed it yet.

Get it here: https://signal.org/install

Once you do, we can all switch together! 🙌`,
  },
};

export function getTemplates(lang: Language): Templates {
  return templates[lang];
}
