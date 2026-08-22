/**
 * Nigerian banks, with their NIBSS/CBN codes.
 *
 * GENERATED. Do not hand-edit — run `npm run refresh:banks` instead, which
 * rewrites this file from the source below and prints what changed.
 *
 * ## Where the codes come from, and why that matters
 *
 * `payments/file.ts` in the API is blunt about the stakes: the Bank Code column
 * of a payment file "is left empty rather than guessed: **a wrong bank code
 * routes money to the wrong institution**". So none of these were typed from
 * memory. They come from Paystack's public bank list
 * (`GET https://api.paystack.co/bank?country=nigeria`), which is the de-facto
 * reference the Nigerian payments ecosystem already runs on, and which needs no
 * credential to read.
 *
 * ## Filtered, deliberately
 *
 * Paystack returns 279 entries. This file keeps the 255 that are
 * `active`, `currency: NGN`, `type: nuban` and `supports_transfer` — the ones a
 * salary can actually be paid into. A dropdown offering an institution that
 * cannot receive a transfer is a support ticket waiting to happen.
 *
 * ## Read at build time, not at request time
 *
 * Checked in rather than fetched live, on purpose. The employee form must not
 * stop working because a third party is down, bank codes change a handful of
 * times a year rather than per request, and a code that silently changed under
 * a running app is exactly the failure the warning above describes. Refreshing
 * is a deliberate act with a diff to review.
 *
 * Four codes are shared by more than one entry in the source, where Paystack
 * lists an institution under two names. Both are kept: dropping one would hide
 * the name somebody's own bank statement uses.
 *
 * Fetched 2026-08-21.
 */

export type Bank = { label: string; code: string };

/**
 * A bank a picker may offer: one from the register, or one only a record holds.
 *
 * `code: null` is the second case and the whole reason this type is separate
 * from `Bank`. See `banksIncluding`.
 */
export type BankChoice = { label: string; code: string | null };

export const NIGERIAN_BANKS: readonly Bank[] = [
  { label: "5TT MFB", code: "51455" },
  { label: "78 Finance Company Ltd", code: "40195" },
  { label: "9jaPay Microfinance Bank", code: "090629" },
  { label: "9mobile 9Payment Service Bank", code: "120001" },
  { label: "Abbey Mortgage Bank", code: "404" },
  { label: "Above Only MFB", code: "51204" },
  { label: "Abulesoro MFB", code: "51312" },
  { label: "Access Bank", code: "044" },
  { label: "Access Bank (Diamond)", code: "063" },
  { label: "Accion Microfinance Bank", code: "602" },
  { label: "Advancly MFB", code: "090759" },
  { label: "Aella MFB", code: "50315" },
  { label: "AG Mortgage Bank", code: "90077" },
  { label: "Ahmadu Bello University Microfinance Bank", code: "50036" },
  { label: "Airtel Smartcash PSB", code: "120004" },
  { label: "AKU Microfinance Bank", code: "51336" },
  { label: "Akuchukwu Microfinance Bank Limited", code: "090561" },
  { label: "Al-Barakah Microfinance Bank", code: "50055" },
  { label: "ALAT by WEMA", code: "035A" },
  { label: "Alert MFB ", code: "51074" },
  { label: "ALLWORKERS MFB", code: "50059" },
  { label: "Alpha Morgan Bank", code: "108" },
  { label: "Alternative bank", code: "000304" },
  { label: "Amju Unique MFB", code: "50926" },
  { label: "Aramoko MFB", code: "50083" },
  { label: "ASO Savings and Loans", code: "401" },
  { label: "Assets Microfinance Bank", code: "50092" },
  { label: "Astrapolaris MFB LTD", code: "MFB50094" },
  { label: "AVUENEGBE MICROFINANCE BANK", code: "090478" },
  { label: "AWACASH MICROFINANCE BANK", code: "51351" },
  { label: "AZTEC MICROFINANCE BANK LIMITED", code: "51337" },
  { label: "Bainescredit MFB", code: "51229" },
  { label: "Banc Corp Microfinance Bank", code: "50117" },
  { label: "Bank78 Microfinance Bank", code: "11072" },
  { label: "BANKIT MFB", code: "50572" },
  { label: "BANKIT MICROFINANCE BANK LTD", code: "50572" },
  { label: "BANKLY MFB", code: "51341" },
  { label: "Baobab Microfinance Bank", code: "MFB50992" },
  { label: "BellBank Microfinance Bank", code: "51100" },
  { label: "Benysta Microfinance Bank Limited", code: "51267" },
  { label: "Berachah Microfinance Bank Ltd.", code: "50122" },
  { label: "Beststar Microfinance Bank", code: "50123" },
  { label: "BOLD MFB", code: "50725" },
  { label: "Boost Microfinance Bank", code: "51449" },
  { label: "Bosak Microfinance Bank", code: "650" },
  { label: "Bowen Microfinance Bank", code: "50931" },
  { label: "Branch International Finance Company Limited", code: "FC40163" },
  { label: "Brent Mortgage bank", code: "90070" },
  { label: "BuyPower MFB", code: "50645" },
  { label: "Carbon", code: "565" },
  { label: "Cashbridge Microfinance Bank Limited", code: "51353" },
  { label: "CASHCONNECT MFB", code: "865" },
  { label: "Cedrus MFB", code: "51437" },
  { label: "CEMCS Microfinance Bank", code: "50823" },
  { label: "Centrum Finance", code: "050032" },
  { label: "Chanelle Microfinance Bank Limited", code: "50171" },
  { label: "Chikum Microfinance bank", code: "312" },
  { label: "Citibank Nigeria", code: "023" },
  { label: "CITYCODE MORTAGE BANK", code: "070027" },
  { label: "Consumer Microfinance Bank", code: "50910" },
  { label: "Cool Microfinance Bank Limited", code: "51458" },
  { label: "Corestep MFB", code: "50204" },
  { label: "Coronation Merchant Bank", code: "559" },
  { label: "County Finance Limited", code: "FC40128" },
  { label: "Credit Direct Limited", code: "40119" },
  { label: "Crescent MFB", code: "51297" },
  { label: "Crust Microfinance Bank", code: "090560" },
  { label: "CRUTECH MICROFINANCE BANK LTD", code: "50216" },
  { label: "Dash Microfinance Bank", code: "51368" },
  { label: "Davenport MICROFINANCE BANK", code: "51334" },
  { label: "Dillon Microfinance Bank", code: "51450" },
  { label: "Dot Microfinance Bank", code: "50162" },
  { label: "EBSU Microfinance Bank", code: "50922" },
  { label: "Ecobank Nigeria", code: "050" },
  { label: "Ekimogun MFB", code: "50263" },
  { label: "Ekondo Microfinance Bank", code: "098" },
  { label: "ESO-E MICROFINANCE BANK LIMITED", code: "50280" },
  { label: "Ethica MFB", code: "51475" },
  { label: "EXCEL FINANCE BANK", code: "090678" },
  { label: "Eyowo", code: "50126" },
  { label: "Fairmoney Microfinance Bank", code: "51318" },
  { label: "FCMB MFB", code: "51241" },
  { label: "Fedeth MFB", code: "50298" },
  { label: "Fewchore Finance Company Limited", code: "050002" },
  { label: "FFS Microfinance Bank", code: "51110" },
  { label: "Fidelity Bank", code: "070" },
  { label: "Firmus MFB", code: "51314" },
  { label: "First Bank of Nigeria", code: "011" },
  { label: "First City Monument Bank", code: "214" },
  { label: "FIRST ROYAL MICROFINANCE BANK", code: "090164" },
  { label: "FIRSTMIDAS MFB", code: "51333" },
  { label: "FirstTrust Mortgage Bank Nigeria", code: "413" },
  { label: "Flutterwave MFB", code: "090567" },
  { label: "Fortress MFB", code: "D53" },
  { label: "FSDH Merchant Bank Limited", code: "501" },
  { label: "FUTMINNA MICROFINANCE BANK", code: "832" },
  { label: "Garun Mallam MFB", code: "MFB51093" },
  { label: "Gateway Mortgage Bank LTD", code: "812" },
  { label: "Globus Bank", code: "00103" },
  { label: "Goldman MFB", code: "090574" },
  { label: "GoMoney", code: "100022" },
  { label: "GOOD SHEPHERD MICROFINANCE BANK", code: "090664" },
  { label: "Goodnews Microfinance Bank", code: "50739" },
  { label: "Greenwich Merchant Bank", code: "562" },
  { label: "GROOMING MICROFINANCE BANK", code: "51276" },
  { label: "GTI MFB", code: "50368" },
  { label: "Guaranty Trust Bank", code: "058" },
  { label: "Hackman Microfinance Bank", code: "51251" },
  { label: "Haggai Mortgage Bank", code: "90065" },
  { label: "Hasal Microfinance Bank", code: "50383" },
  { label: "Hayat Trust MFB", code: "51364" },
  { label: "HopePSB", code: "120002" },
  { label: "IBANK Microfinance Bank", code: "51211" },
  { label: "IBBU MFB", code: "51279" },
  { label: "Ibile Microfinance Bank", code: "51244" },
  { label: "Ibom Mortgage Bank", code: "90012" },
  { label: "Ikoyi Osun MFB", code: "50439" },
  { label: "Ilaro Poly Microfinance Bank", code: "50442" },
  { label: "Imowo MFB", code: "50453" },
  { label: "IMPERIAL HOMES MORTAGE BANK", code: "415" },
  { label: "Infinity MFB", code: "50457" },
  { label: "Infinity trust  Mortgage Bank", code: "070016" },
  { label: "ISUA MFB", code: "090701" },
  { label: "Jaiz Bank", code: "301" },
  { label: "Jubilee Life Mortgage Bank", code: "402" },
  { label: "Kadpoly MFB", code: "50502" },
  { label: "KANOPOLY MFB", code: "51308" },
  { label: "Kayvee Microfinance Bank", code: "5129" },
  { label: "Keystone Bank", code: "082" },
  { label: "Kolomoni MFB", code: "899" },
  { label: "KONGAPAY (Kongapay Technologies Limited)(formerly Zinternet)", code: "100025" },
  { label: "Kredi Money MFB LTD", code: "50200" },
  { label: "Kuda Bank", code: "50211" },
  { label: "Lagos Building Investment Company Plc.", code: "90052" },
  { label: "Lemmy MFB", code: "091003" },
  { label: "Letshego Microfinance Bank", code: "090420" },
  { label: "Links MFB", code: "50549" },
  { label: "Living Trust Mortgage Bank", code: "031" },
  { label: "LOMA MFB", code: "50491" },
  { label: "Lotus Bank", code: "303" },
  { label: "Maal MFB", code: "51444" },
  { label: "MAINSTREET MICROFINANCE BANK", code: "090171" },
  { label: "Mayden Microfinance Bank", code: "51474" },
  { label: "Mayfair MFB", code: "50563" },
  { label: "Mega Microfinance Bank", code: "50570" },
  { label: "Mint MFB", code: "50304" },
  { label: "MINT-FINEX MFB", code: "09" },
  { label: "Money Master PSB", code: "946" },
  { label: "Moniepoint MFB", code: "50515" },
  { label: "MTN Momo PSB", code: "120003" },
  { label: "MUTUAL BENEFITS MICROFINANCE BANK", code: "090190" },
  { label: "NDCC MICROFINANCE BANK", code: "090679" },
  { label: "NET MICROFINANCE BANK", code: "51361" },
  { label: "Nigerian Navy Microfinance Bank Limited", code: "51142" },
  { label: "NIRSAL MICROFINANCE", code: "51304" },
  { label: "Nombank MFB", code: "50072" },
  { label: "NOVA BANK", code: "561" },
  { label: "Novus MFB", code: "51371" },
  { label: "NPF MICROFINANCE BANK", code: "50629" },
  { label: "NSUK MICROFINANACE BANK", code: "51261" },
  { label: "NUVION MFB", code: "51392" },
  { label: "Olabisi Onabanjo University Microfinance Bank", code: "50689" },
  { label: "OLUCHUKWU MICROFINANCE BANK LTD", code: "50697" },
  { label: "OPay Digital Services Limited (OPay)", code: "999992" },
  { label: "Optimus Bank Limited", code: "107" },
  { label: "Pact Microfinance Bank", code: "51477" },
  { label: "Paga", code: "100002" },
  { label: "PalmPay", code: "999991" },
  { label: "Parallex Bank", code: "104" },
  { label: "Parkway - ReadyCash", code: "311" },
  { label: "PATHFINDER MICROFINANCE BANK LIMITED", code: "090680" },
  { label: "Paystack MFB", code: "51457" },
  { label: "Paystack-Titan", code: "100039" },
  { label: "Peace Microfinance Bank", code: "50743" },
  { label: "PECANTRUST MICROFINANCE BANK LIMITED", code: "51226" },
  { label: "Personal Trust MFB", code: "51146" },
  { label: "Petra Mircofinance Bank Plc", code: "50746" },
  { label: "Pettysave MFB", code: "MFB51452" },
  { label: "PFI FINANCE COMPANY LIMITED", code: "050021" },
  { label: "Platinum Mortgage Bank", code: "268" },
  { label: "Pocket App", code: "00716" },
  { label: "Polaris Bank", code: "076" },
  { label: "Polyunwana MFB", code: "50864" },
  { label: "PremiumTrust Bank", code: "105" },
  { label: "Prospa Capital Microfinance Bank", code: "50739" },
  { label: "PROSPERIS FINANCE LIMITED", code: "050023" },
  { label: "Providus Bank", code: "101" },
  { label: "QuickFund MFB", code: "51293" },
  { label: "Rand Merchant Bank", code: "502" },
  { label: "RANDALPHA MICROFINANCE BANK", code: "090496" },
  { label: "Rank MFB", code: "50130" },
  { label: "Refuge Mortgage Bank", code: "90067" },
  { label: "REHOBOTH MICROFINANCE BANK", code: "50761" },
  { label: "Rephidim Microfinance Bank", code: "50994" },
  { label: "Retrust Mfb", code: "51375" },
  { label: "Rex Microfinance Bank", code: "51108" },
  { label: "Rigo Microfinance Bank Limited", code: "51286" },
  { label: "ROCKSHIELD MICROFINANCE BANK", code: "50767" },
  { label: "Rubies MFB", code: "125" },
  { label: "Safe Haven MFB", code: "51113" },
  { label: "SAGE GREY FINANCE LIMITED", code: "40165" },
  { label: "Shield MFB", code: "50582" },
  { label: "Signature Bank Ltd", code: "106" },
  { label: "Solid Allianze MFB", code: "51062" },
  { label: "Solid Rock MFB", code: "50800" },
  { label: "Sparkle Microfinance Bank", code: "51310" },
  { label: "SPECTRUM MFB LTD", code: "50756" },
  { label: "Springfield Microfinance Bank", code: "51429" },
  { label: "Stanbic IBTC Bank", code: "221" },
  { label: "Standard Chartered Bank", code: "068" },
  { label: "STANFORD MICROFINANCE BANK", code: "090162" },
  { label: "STATESIDE MICROFINANCE BANK", code: "50809" },
  { label: "STB Mortgage Bank", code: "070022" },
  { label: "Stellas MFB", code: "51253" },
  { label: "Sterling Bank", code: "232" },
  { label: "Summit Bank", code: "00305" },
  { label: "Suntrust Bank", code: "100" },
  { label: "Supreme MFB", code: "50968" },
  { label: "TAJ Bank", code: "302" },
  { label: "Tangerine Money", code: "51269" },
  { label: "Tatum Bank", code: "109" },
  { label: "TENN", code: "51403" },
  { label: "Think Finance Microfinance Bank", code: "677" },
  { label: "Titan Bank", code: "102" },
  { label: "TransPay MFB", code: "090708" },
  { label: "TRUSTBANC J6 MICROFINANCE BANK", code: "51118" },
  { label: "U and C MFB", code: "50840" },
  { label: "U&C Microfinance Bank Ltd (U AND C MFB)", code: "50840" },
  { label: "UBJ Microfinance Bank Limited", code: "51396" },
  { label: "UCEE MFB", code: "090706" },
  { label: "Uhuru MFB", code: "51322" },
  { label: "Ultraviolet Microfinance Bank", code: "51080" },
  { label: "Unaab Microfinance Bank Limited", code: "50870" },
  { label: "UNIABUJA MFB", code: "51447" },
  { label: "Unical MFB", code: "50871" },
  { label: "Unilag Microfinance Bank", code: "51316" },
  { label: "UNIMAID MICROFINANCE BANK", code: "50875" },
  { label: "Union Bank of Nigeria", code: "032" },
  { label: "United Bank For Africa", code: "033" },
  { label: "Unity Bank", code: "215" },
  { label: "UNIUYO Microfinance Bank Ltd", code: "50880" },
  { label: "Uzondu Microfinance Bank Awka Anambra State", code: "50894" },
  { label: "Vale Finance Limited", code: "050020" },
  { label: "VFD Microfinance Bank Limited", code: "566" },
  { label: "Victory MFB", code: "51085" },
  { label: "Waya Microfinance Bank", code: "51355" },
  { label: "Wema Bank", code: "035" },
  { label: "Weston Charis MFB", code: "51386" },
  { label: "Whitecrust Finance Company", code: "402001" },
  { label: "Xpress Wallet", code: "100040" },
  { label: "YCT MFB", code: "51253" },
  { label: "Yes MFB", code: "594" },
  { label: "Zap", code: "00zap" },
  { label: "Zenith Bank", code: "057" },
  { label: "Zitra MFB", code: "51373" },
];

/** Code for a bank name, or null when the name is not one we carry. */
export function bankCodeFor(name: string): string | null {
  const needle = name.trim().toLowerCase();
  return (
    NIGERIAN_BANKS.find((b) => b.label.toLowerCase() === needle)?.code ?? null
  );
}

/**
 * The register, plus whatever a record already holds.
 *
 * A stored bank name that is not in this list is the case that matters: an
 * imported record, a name typed before the register was checked in, or an
 * institution that has since been renamed. A picker that simply omits it shows
 * "not known yet" over an account that is being paid every month, and the next
 * person to open that record has been told something false.
 *
 * The appended entry carries **`code: null`, never a guess.** `payments/file.ts`
 * in the API is blunt about why: a wrong bank code routes money to the wrong
 * institution. A missing code is a gap somebody can close; an invented one is a
 * payment nobody can recall.
 */
export function banksIncluding(current?: string | null): readonly BankChoice[] {
  const trimmed = current?.trim();
  if (!trimmed || bankCodeFor(trimmed) !== null) return NIGERIAN_BANKS;
  return [...NIGERIAN_BANKS, { label: trimmed, code: null }];
}
