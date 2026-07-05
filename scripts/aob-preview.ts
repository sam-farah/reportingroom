import fs from "fs";
import sharp from "sharp";
import { renderAobCopy } from "../server/aob-form";

async function makeSampleSig(): Promise<string> {
  const svg = `<svg width="200" height="60" xmlns="http://www.w3.org/2000/svg">
    <path d="M10,40 C30,10 40,50 60,20 S90,40 110,15 S140,45 170,20" fill="none" stroke="#000" stroke-width="3"/>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

const aobForm: any = {
  patientName: "Farah Sample",
  patientDateOfBirth: "1986-04-12",
  medicareNumber: "12345678",
  medicareIrn: "1",
  referringDoctorName: "Dr John Referrer",
  referringDoctorProviderNumber: "654321AB",
  referringDoctorAddress: "123 Example Street, Sydney NSW 2000",
  referralDate: "2026-06-30",
  dateOfService: "2026-07-04",
  items: [
    { item: "11612", description: "Exercise study for lower limb", feeCents: 13450 },
    { item: "55238", description: "Duplex ultrasound bilateral", feeCents: 7625 },
  ],
};

const clinic: any = {
  locationSpecificPracticeNumber: "01308",
  timezone: "Australia/Sydney",
};

async function main() {
  const copy = (process.argv[2] as "practitioner" | "patient") || "practitioner";
  const sampleSig = await makeSampleSig();
  const buf = await renderAobCopy({ aobForm, clinic, signatureDataUrl: sampleSig }, copy);
  fs.writeFileSync(`/tmp/aob_preview_${copy}.jpg`, buf);
  console.log(`wrote /tmp/aob_preview_${copy}.jpg`);
}

main();
