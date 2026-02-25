import { PrismaClient, ContactMethod } from '@prisma/client';

const prisma = new PrismaClient();

// Contact updates based on the Excel data
const contactUpdates = [
  {
    name: "Syed Noman Kazmi",
    company: "United Airlines",
    contactMethod: "LINKEDIN_GROUP",
    isFunctionallyRelevant: true,  // Senior Full Stack Engineer
    isAlumni: false,
  },
  {
    name: "Prashanth M",
    company: "United Airlines",
    contactMethod: "LINKEDIN_GROUP",
    isFunctionallyRelevant: true,  // Developer II
    isAlumni: false,
  },
  {
    name: "Sohil S",
    company: "United Airlines",
    contactMethod: "LINKEDIN_GROUP",
    isFunctionallyRelevant: true,  // IT Leader - Software Engineering
    isAlumni: false,
  },
  {
    name: "Anand Davé",
    company: "Watershed",
    contactMethod: "LINKEDIN_GROUP",
    isFunctionallyRelevant: false,  // Customer Success Leader (not technical)
    isAlumni: false,
  },
  {
    name: "Camren Babbs",
    company: "Watershed",
    contactMethod: "DIRECT_EMAIL_HUNTER",  // Has email: camren@watershed.com
    isFunctionallyRelevant: true,  // IT Leader
    isAlumni: false,
  },
  {
    name: "Angelique Nehmzow",
    company: "Notion",
    contactMethod: "SECOND_DEGREE",  // HRX Slack community connection
    isFunctionallyRelevant: true,  // Software Engineer
    isAlumni: true,  // HRX community affinity
  },
  {
    name: "Julie Yu",
    company: "Notion",
    contactMethod: "SECOND_DEGREE",  // HRX Slack
    isFunctionallyRelevant: true,  // Software Engineer
    isAlumni: true,  // HRX community affinity
  },
  {
    name: "Alexi Taylor",
    company: "Strava",
    contactMethod: "SECOND_DEGREE",  // HRX Slack
    isFunctionallyRelevant: true,  // Senior Software Engineer II
    isAlumni: true,  // HRX community affinity
  },
  {
    name: "Nomaan Ahgharian",
    company: "Strava",
    contactMethod: "LINKEDIN_GROUP",
    isFunctionallyRelevant: true,  // Senior Software Engineer
    isAlumni: false,
  },
  {
    name: "Javed Bartlett",
    company: "Microsoft",
    contactMethod: "LINKEDIN_GROUP",  // Pending group requests
    isFunctionallyRelevant: true,  // Senior Software Engineer
    isAlumni: false,
  },
  {
    name: "Timothy Nguyen",
    company: "Microsoft",
    contactMethod: "SECOND_DEGREE",  // HRX Slack
    isFunctionallyRelevant: true,  // Software Engineer
    isAlumni: true,  // HRX community affinity
  },
  {
    name: "Kevin Fei",
    company: "Watershed",
    contactMethod: "DIRECT_EMAIL_HUNTER",  // Has email
    isFunctionallyRelevant: true,  // Software Engineering Manager (very relevant)
    isAlumni: false,
  },
  {
    name: "Christian Ayala",
    company: "Watershed",
    contactMethod: "DIRECT_EMAIL_HUNTER",  // Has email
    isFunctionallyRelevant: true,  // Senior Software Engineer
    isAlumni: false,
  },
  {
    name: "Eric Nevalsky",
    company: "Watershed",
    contactMethod: "DIRECT_EMAIL_HUNTER",  // Has email
    isFunctionallyRelevant: false,  // Sustainability Advisor (not technical)
    isAlumni: true,  // "both went to ICLP in Taiwan"
  },
  {
    name: "Ezekiel Samatua",
    company: "Microsoft",
    contactMethod: "SECOND_DEGREE",  // HRX Slack
    isFunctionallyRelevant: true,  // Software Engineer
    isAlumni: true,  // HRX community affinity
  },
];

async function main() {
  console.log('Updating contacts...\n');

  for (const update of contactUpdates) {
    // Find the contact
    const contact = await prisma.contact.findFirst({
      where: {
        name: update.name,
        employer: {
          name: update.company,
        },
      },
    });

    if (!contact) {
      console.log(`⚠️  Contact not found: ${update.name} at ${update.company}`);
      continue;
    }

    // Update the contact
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        contactMethod: update.contactMethod as ContactMethod,
        isFunctionallyRelevant: update.isFunctionallyRelevant,
        isAlumni: update.isAlumni,
      },
    });

    console.log(`✓ Updated: ${update.name} at ${update.company}`);
    console.log(`  Method: ${update.contactMethod}, Functional: ${update.isFunctionallyRelevant}, Alumni: ${update.isAlumni}`);
  }

  console.log('\n✅ Contact updates complete!');
}

main()
  .catch((e) => {
    console.error('Update failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
