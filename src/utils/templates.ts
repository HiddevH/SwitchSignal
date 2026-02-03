import { GroupInvite, Language } from '../types';

interface Templates {
  personal: (name: string, groups: GroupInvite[]) => string;
  group: (inviteLink: string) => string;
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
  },
};

export function getTemplates(lang: Language): Templates {
  return templates[lang];
}
