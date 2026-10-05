import { describe, expect, it } from 'vitest';
import { resolveGreetingName, templateGreetingName, renderNameTemplate, normalizeTemplateNameVariables, greetingInstructions } from '../../supabase/functions/_shared/whatsappPersonalization';

describe('WhatsApp greeting personalization', () => {
  it.each([
    ['Marie Dupont', 'Marie'], ['Élodie Martin', 'Élodie'], ['Jean-Pierre Dupont', 'Jean-Pierre'],
    ['M. Mohamed Amrani', 'Mohamed'], ['محمد بن علي', 'محمد'], ['عبد الرحمن عمر', 'عبد الرحمن'],
    ['عبد الله احمد', 'عبد الله'], ['نور الدين علي', 'نور الدين'], ['نور علي', 'نور'],
    ['محمد Mohamed Amrani', 'محمد'], ['Mohamed محمد Amrani', 'Mohamed'], ['عبد الرحمن / Abderrahmane', 'عبد الرحمن'],
    ['Abdel Rahman Dupont', 'Abdel Rahman'], ['Massi Web', 'Massi'],
  ])('shortens %s without altering script', (input, expected) => {
    expect(resolveGreetingName(input)).toBe(expected);
  });
  it.each(['Acme SARL', 'Dupont & Fils', 'HKSN Services', 'شركة الأمل', 'Decowork Mohamed', 'Contact', 'Lead 12', '+213 559 489 424', '', '👋'])('avoids invented personal names for %s', (input) => {
    expect(resolveGreetingName(input)).toBeNull();
  });
  it('recognizes the company field without rejecting a real contact', () => {
    expect(resolveGreetingName('HKSN', 'HKSN')).toBeNull();
    expect(resolveGreetingName('Marie Dupont', 'Acme SARL')).toBe('Marie');
  });
  it('uses neutral nonempty approved-template parameters', () => {
    expect(templateGreetingName('Acme SARL')).toBe('à vous');
    expect(templateGreetingName('شركة الأمل', null, 'مرحبا {{1}}')).toBe('بكم');
    expect(renderNameTemplate('Bonjour {{name}},\nVotre rendez-vous', 'Acme SARL')).toBe('Bonjour,\nVotre rendez-vous');
    expect(renderNameTemplate('Bonjour {{name}} !', 'عبد الرحمن عمر')).toBe('Bonjour عبد الرحمن !');
  });
  it('enforces name variables while preserving dates, companies and other content', () => {
    expect(normalizeTemplateNameVariables('Bonjour {{1}}, RDV {{2}} pour {{3}}', ['invented', '11h', 'Acme'], 'Marie Dupont')).toEqual(['Marie', '11h', 'Acme']);
    expect(normalizeTemplateNameVariables('Bonjour {{1}}', ['John'], 'Acme SARL')).toEqual(['à vous']);
    expect(normalizeTemplateNameVariables('Votre contact {{1}}', ['Marie Dupont'], 'Marie Dupont')).toEqual(['Marie']);
    expect(greetingInstructions('محمد Mohamed')).toContain('« محمد »');
    expect(greetingInstructions('شركة الأمل')).toContain('N\'invente aucun nom');
  });
});