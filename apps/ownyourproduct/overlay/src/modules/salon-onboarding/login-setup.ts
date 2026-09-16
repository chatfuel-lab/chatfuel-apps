import { countryForZone, proposeSalonZone, supportedZones } from "./timezone";
import { isSupportedCountry, supportedCountries } from "./salon-locale";

export const setupCountries = () => supportedCountries();

// The identity screen's decisions, with no React and no storage around them, so
// a test can put the form in any shape it likes — the same split `gate.ts`
// keeps for the activation gate.
//
// There is exactly one rule worth reading twice: the salon is never created
// with a zone that would make it read back as a different country. Chatfuel has
// nowhere to store a country, so `countryForZone` recovers it from the zone,
// and the currency, the VAT default and the phone prefix all follow. That is
// why an unsettled zone blocks the button instead of quietly borrowing the
// phone's own.

export interface SetupFormInput {
  businessName: string;
  /** ISO-3166 alpha-2 as the picker holds it — "" until she chooses. */
  country: string;
  /** Her explicit pick, used only where the country cannot settle the zone. */
  zoneChoice: string;
  /** This browser's zone, or null where the platform will not say. */
  device: string | null;
}

/** Exactly what the workspace is created with. */
export interface SetupIdentity {
  businessName: string;
  /** ISO-3166 alpha-2, lowercase — the key `salon-locale` and `timezone` speak. */
  country: string;
  /** Proposed from the country; the Horario card is where she confirms it. */
  timezone: string;
}

export interface SetupFormState {
  /** The zone the salon will be created with, or null while it is unsettled. */
  zone: string | null;
  /**
   * The zones to offer her. Empty whenever the country already settles it —
   * a select with one obvious answer is a question she should not be asked.
   */
  zoneOptions: string[];
  ready: boolean;
  identity: SetupIdentity | null;
}

export function setupFormState(input: SetupFormInput): SetupFormState {
  const businessName = input.businessName.trim();
  const country = input.country.trim().toLowerCase();
  const derived = proposeSalonZone(country, input.device);
  // Offered zones are filtered to the chosen country for the same reason the
  // derived one is preferred: an owner who picks Los Angeles for a Chilean
  // salon has invented a US salon, and nothing downstream would ever tell her.
  const zoneOptions = derived || !country
    ? []
    : supportedZones().filter((zone) => countryForZone(zone) === country);
  const chosen = zoneOptions.includes(input.zoneChoice) ? input.zoneChoice : "";
  const zone = derived ?? (chosen || null);
  const ready = !!businessName && isSupportedCountry(country) && !!zone;
  return {
    zone,
    zoneOptions,
    ready,
    identity: ready ? { businessName, country, timezone: zone! } : null,
  };
}
