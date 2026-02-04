import { getTemplates } from '../../src/utils/templates';
import { GroupInvite } from '../../src/types';

const sampleGroups: GroupInvite[] = [
  { name: 'Family Group', inviteLink: 'https://signal.group/#abc' },
  { name: 'Sports Team', inviteLink: 'https://signal.group/#def' },
];

describe('getTemplates', () => {
  describe('Dutch (nl)', () => {
    const templates = getTemplates('nl');

    describe('personal template', () => {
      it('includes the person name', () => {
        const result = templates.personal('Jan', sampleGroups);
        expect(result).toContain('Jan');
      });

      it('includes all group names', () => {
        const result = templates.personal('Jan', sampleGroups);
        expect(result).toContain('Family Group');
        expect(result).toContain('Sports Team');
      });

      it('includes all invite links', () => {
        const result = templates.personal('Jan', sampleGroups);
        expect(result).toContain('https://signal.group/#abc');
        expect(result).toContain('https://signal.group/#def');
      });

      it('includes Signal install link', () => {
        const result = templates.personal('Jan', sampleGroups);
        expect(result).toContain('https://signal.org/install');
      });

      it('is in Dutch', () => {
        const result = templates.personal('Jan', sampleGroups);
        expect(result).toContain('stappen over van WhatsApp naar Signal');
        expect(result).toContain('uitnodigingslinks');
      });

      it('handles empty groups list', () => {
        const result = templates.personal('Jan', []);
        expect(result).toContain('Jan');
        expect(result).toContain('uitnodigingslinks');
      });

      it('handles a single group', () => {
        const result = templates.personal('Jan', [sampleGroups[0]]);
        expect(result).toContain('Family Group');
        expect(result).not.toContain('Sports Team');
      });
    });

    describe('group template', () => {
      it('includes the invite link', () => {
        const result = templates.group('https://signal.group/#xyz');
        expect(result).toContain('https://signal.group/#xyz');
      });

      it('is in Dutch', () => {
        const result = templates.group('https://signal.group/#xyz');
        expect(result).toContain('verhuist naar Signal');
      });

      it('includes Signal install link', () => {
        const result = templates.group('https://signal.group/#xyz');
        expect(result).toContain('https://signal.org/install');
      });
    });
  });

  describe('English (en)', () => {
    const templates = getTemplates('en');

    describe('personal template', () => {
      it('includes the person name', () => {
        const result = templates.personal('John', sampleGroups);
        expect(result).toContain('John');
      });

      it('includes all group names and links', () => {
        const result = templates.personal('John', sampleGroups);
        expect(result).toContain('Family Group');
        expect(result).toContain('https://signal.group/#abc');
      });

      it('is in English', () => {
        const result = templates.personal('John', sampleGroups);
        expect(result).toContain("switching from WhatsApp to Signal");
        expect(result).toContain('invite links');
      });

      it('includes Signal install link', () => {
        const result = templates.personal('John', sampleGroups);
        expect(result).toContain('https://signal.org/install');
      });
    });

    describe('group template', () => {
      it('includes the invite link', () => {
        const result = templates.group('https://signal.group/#xyz');
        expect(result).toContain('https://signal.group/#xyz');
      });

      it('is in English', () => {
        const result = templates.group('https://signal.group/#xyz');
        expect(result).toContain('moving to Signal');
      });
    });
  });

  describe('nudge template', () => {
    it('includes name and single group in Dutch', () => {
      const nl = getTemplates('nl');
      const result = nl.nudge('Jan', ['Familiegroep']);
      expect(result).toContain('Jan');
      expect(result).toContain('Familiegroep');
      expect(result).toContain('https://signal.org/install');
    });

    it('includes name and multiple groups in Dutch', () => {
      const nl = getTemplates('nl');
      const result = nl.nudge('Jan', ['Familiegroep', 'Sportclub']);
      expect(result).toContain('Jan');
      expect(result).toContain('Familiegroep');
      expect(result).toContain('Sportclub');
    });

    it('includes name and single group in English', () => {
      const en = getTemplates('en');
      const result = en.nudge('John', ['Family']);
      expect(result).toContain('John');
      expect(result).toContain('Family');
      expect(result).toContain('https://signal.org/install');
    });

    it('includes name and multiple groups in English', () => {
      const en = getTemplates('en');
      const result = en.nudge('John', ['Family', 'Sports']);
      expect(result).toContain('John');
      expect(result).toContain('Family');
      expect(result).toContain('Sports');
    });

    it('uses singular phrasing for single group in English', () => {
      const en = getTemplates('en');
      const result = en.nudge('John', ['Family']);
      expect(result).toContain('Our group "Family" is almost ready');
    });

    it('uses plural phrasing for multiple groups in English', () => {
      const en = getTemplates('en');
      const result = en.nudge('John', ['Family', 'Sports']);
      expect(result).toContain('Our groups');
      expect(result).toContain('are almost ready');
    });
  });

  it('returns different templates for nl and en', () => {
    const nl = getTemplates('nl');
    const en = getTemplates('en');

    const nlResult = nl.personal('Test', sampleGroups);
    const enResult = en.personal('Test', sampleGroups);

    expect(nlResult).not.toBe(enResult);
    // Both should include the same data
    expect(nlResult).toContain('Test');
    expect(enResult).toContain('Test');
    expect(nlResult).toContain('Family Group');
    expect(enResult).toContain('Family Group');
  });
});
