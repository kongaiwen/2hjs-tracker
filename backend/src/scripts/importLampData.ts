import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Data from LAMP_List_2026.xlsx
const companies = [
  { name: "United Airlines", advocacy: true, motivation: 3, posting: 3 },
  { name: "Watershed", advocacy: true, motivation: 3, posting: 3 },
  { name: "Notion", advocacy: true, motivation: 3, posting: 3 },
  { name: "Strava", advocacy: true, motivation: 3, posting: 3 },
  { name: "Microsoft", advocacy: true, motivation: 3, posting: 3 },
  { name: "Overstory", advocacy: false, motivation: 3, posting: 3 },
  { name: "Arcadia", advocacy: false, motivation: 3, posting: 3 },
  { name: "Quilt", advocacy: false, motivation: 3, posting: 3 },
  { name: "Sitetracker", advocacy: false, motivation: 3, posting: 3 },
  { name: "Span", advocacy: false, motivation: 3, posting: 3 },
  { name: "Stemuli", advocacy: false, motivation: 3, posting: 3 },
  { name: "Feeld", advocacy: false, motivation: 3, posting: 3 },
  { name: "Hipcamp", advocacy: false, motivation: 3, posting: 3 },
  { name: "Lime", advocacy: false, motivation: 3, posting: 3 },
  { name: "Duolingo", advocacy: false, motivation: 3, posting: 3 },
  { name: "Hammerhead AI", advocacy: false, motivation: 3, posting: 3 },
  { name: "Com Ed", advocacy: false, motivation: 3, posting: 1 },
  { name: "Folx Health", advocacy: false, motivation: 3, posting: 1 },
  { name: "Home Assistant", advocacy: false, motivation: 3, posting: 1 },
  { name: "IFTTT", advocacy: false, motivation: 3, posting: 1 },
  { name: "Innowatts", advocacy: false, motivation: 3, posting: 1 },
  { name: "Lex", advocacy: false, motivation: 3, posting: 1 },
  { name: "Opus One Solutions", advocacy: false, motivation: 3, posting: 1 },
  { name: "Plume", advocacy: false, motivation: 3, posting: 1 },
  { name: "Rubicon", advocacy: false, motivation: 3, posting: 1 },
  { name: "Shimmer", advocacy: false, motivation: 3, posting: 1 },
  { name: "Skritter (Inkren)", advocacy: false, motivation: 3, posting: 1 },
  { name: "Universal Metro Asian Services", advocacy: false, motivation: 3, posting: 1 },
  { name: "Viriciti (ChargePoint)", advocacy: false, motivation: 3, posting: 1 },
  { name: "Volta", advocacy: false, motivation: 3, posting: 1 },
  { name: "Adafruit", advocacy: false, motivation: 2, posting: 1 },
  { name: "Autogrid", advocacy: false, motivation: 2, posting: 1 },
  { name: "Bedrock Energy", advocacy: false, motivation: 2, posting: 1 },
  { name: "Brain.fm", advocacy: false, motivation: 2, posting: 1 },
  { name: "Dandelion Energy", advocacy: false, motivation: 2, posting: 1 },
  { name: "Esgbook", advocacy: false, motivation: 2, posting: 1 },
  { name: "Gaia GPS", advocacy: false, motivation: 2, posting: 1 },
  { name: "Greenly", advocacy: false, motivation: 2, posting: 1 },
  { name: "IND Technology", advocacy: false, motivation: 2, posting: 1 },
  { name: "Sense", advocacy: false, motivation: 2, posting: 1 },
  { name: "Site 20/20", advocacy: false, motivation: 2, posting: 1 },
  { name: "Smartrent", advocacy: false, motivation: 2, posting: 1 },
  { name: "Wren", advocacy: false, motivation: 2, posting: 1 },
  { name: "Zerohash", advocacy: false, motivation: 2, posting: 1 },
  { name: "Aledade", advocacy: true, motivation: 1, posting: 3 },
  { name: "Chargerhelp!", advocacy: false, motivation: 1, posting: 3 },
  { name: "Shure", advocacy: false, motivation: 1, posting: 2 },
  { name: "Architect", advocacy: false, motivation: 1, posting: 1 },
  { name: "Celerity", advocacy: false, motivation: 1, posting: 1 },
  { name: "Rad Power Bikes", advocacy: false, motivation: 1, posting: 1 },
  { name: "Tern Bicicyles", advocacy: false, motivation: 1, posting: 1 },
  { name: "Wag Walking", advocacy: false, motivation: 1, posting: 1 },
  { name: "eXtremeCoding", advocacy: true, motivation: 0, posting: 1 },
  { name: "Audette", advocacy: false, motivation: 0, posting: 1 },
  { name: "Clevest", advocacy: false, motivation: 0, posting: 1 },
  { name: "Convey", advocacy: false, motivation: 0, posting: 1 },
  { name: "Convoy", advocacy: false, motivation: 0, posting: 1 },
  { name: "Daylight", advocacy: false, motivation: 0, posting: 1 },
  { name: "Firstfuel", advocacy: false, motivation: 0, posting: 1 },
  { name: "Go Exceed", advocacy: false, motivation: 0, posting: 1 },
  { name: "Goblin Tools", advocacy: false, motivation: 0, posting: 1 },
  { name: "Greenlots", advocacy: false, motivation: 0, posting: 1 },
  { name: "Grid", advocacy: false, motivation: 0, posting: 1 },
  { name: "Grid Beyond", advocacy: false, motivation: 0, posting: 1 },
  { name: "Gridx", advocacy: false, motivation: 0, posting: 1 },
  { name: "Labster", advocacy: false, motivation: 0, posting: 1 },
  { name: "Occulytics", advocacy: false, motivation: 0, posting: 1 },
  { name: "Pachama", advocacy: false, motivation: 0, posting: 1 },
  { name: "Particle", advocacy: false, motivation: 0, posting: 1 },
  { name: "Power Factors", advocacy: false, motivation: 0, posting: 1 },
  { name: "Remix", advocacy: false, motivation: 0, posting: 1 },
  { name: "Singularity", advocacy: false, motivation: 0, posting: 1 },
  { name: "Sparkfund", advocacy: false, motivation: 0, posting: 1 },
  { name: "Superpedestrian", advocacy: false, motivation: 0, posting: 1 },
  { name: "Synthesis", advocacy: false, motivation: 0, posting: 1 },
  { name: "Tendril", advocacy: false, motivation: 0, posting: 1 },
  { name: "Tiimo", advocacy: false, motivation: 0, posting: 1 }
];

const contacts = [
  { name: "Syed Noman Kazmi", title: "Senior Full Stack Engineer", linkedInUrl: "https://www.linkedin.com/in/syed-noman-kazmi-579b3b297/", company: "United Airlines", email: null, notes: "Best Contact: https://www.linkedin.com/groups/6519652/members/" },
  { name: "Prashanth M", title: "Developer II - Messaging Systems Management", linkedInUrl: "https://www.linkedin.com/in/prashanth-m-94359918a/", company: "United Airlines", email: null, notes: "Best Contact: https://www.linkedin.com/groups/961087/members/" },
  { name: "Sohil S", title: "IT Leader - Software Engineering", linkedInUrl: "https://www.linkedin.com/in/sohil29shah/", company: "United Airlines", email: null, notes: "Best Contact: https://www.linkedin.com/groups/762547/members/" },
  { name: "Anand Davé", title: "Customer Success Leader", linkedInUrl: "https://www.linkedin.com/in/ananddave1/", company: "Watershed", email: null, notes: "Best Contact: https://www.linkedin.com/groups/48754/members/" },
  { name: "Camren Babbs", title: "IT Leader", linkedInUrl: "https://www.linkedin.com/in/camrenbabbs/", company: "Watershed", email: "camren@watershed.com", notes: "Best Contact: https://www.linkedin.com/groups/48754/members/" },
  { name: "Angelique Nehmzow", title: "Software Engineer", linkedInUrl: "https://www.linkedin.com/in/angeliquenehmzow/", company: "Notion", email: null, notes: "Best Contact: HRX Slack; Next Best: Pending group requests" },
  { name: "Julie Yu", title: "Software Engineer", linkedInUrl: "https://www.linkedin.com/in/juliemyu/", company: "Notion", email: null, notes: "Best Contact: HRX Slack" },
  { name: "Alexi Taylor", title: "Senior Software Engineer II", linkedInUrl: "https://www.linkedin.com/in/alexitaylor/", company: "Strava", email: null, notes: "Best Contact: HRX Slack; Next Best: https://www.linkedin.com/groups/121615/members/" },
  { name: "Nomaan Ahgharian", title: "Senior Software Engineer", linkedInUrl: "https://www.linkedin.com/in/nomaan-ahgharian/", company: "Strava", email: null, notes: "Best Contact: https://www.linkedin.com/groups/6519652/" },
  { name: "Javed Bartlett", title: "Senior Software Engineer ", linkedInUrl: null, company: "Microsoft", email: null, notes: "Best Contact: Pending group requests" },
  { name: "Timothy Nguyen", title: "Software Engineer", linkedInUrl: null, company: "Microsoft", email: null, notes: "Best Contact: HRX Slack" },
  { name: "Kevin Fei", title: "Software Engineering Manager", linkedInUrl: null, company: "Watershed", email: "kevin.fei@watershed.com", notes: null },
  { name: "Christian Ayala", title: "Senior Software Engineer", linkedInUrl: null, company: "Watershed", email: "christian@watershed.com", notes: null },
  { name: "Eric Nevalsky", title: "Sustainability Advisor", linkedInUrl: null, company: "Watershed", email: "eric.nevalsky@watershed.com", notes: "Relation: both went to ICLP in Taiwan" },
  { name: "Ezekiel Samatua", title: "Software Engineer", linkedInUrl: null, company: "Microsoft", email: null, notes: "Best Contact: HRX Slack; Next Best: Pending group requests" }
];

async function main() {
  console.log('Starting LAMP data import...');

  // Check existing data
  const existingEmployers = await prisma.employer.count();
  const existingContacts = await prisma.contact.count();

  console.log(`Existing employers: ${existingEmployers}`);
  console.log(`Existing contacts: ${existingContacts}`);

  if (existingEmployers > 0 || existingContacts > 0) {
    console.log('\n⚠️  Database already contains data. Import will add to existing data (no duplicates).');
  }

  // Import companies
  console.log('\n📦 Importing companies...');
  let companiesCreated = 0;
  let companiesSkipped = 0;

  for (const company of companies) {
    const existing = await prisma.employer.findFirst({
      where: { name: company.name }
    });

    if (existing) {
      // Update existing employer with LAMP scores
      await prisma.employer.update({
        where: { id: existing.id },
        data: {
          advocacy: company.advocacy,
          motivation: company.motivation,
          posting: company.posting
        }
      });
      companiesSkipped++;
      console.log(`  ✓ Updated: ${company.name}`);
    } else {
      await prisma.employer.create({
        data: {
          name: company.name,
          advocacy: company.advocacy,
          motivation: company.motivation,
          posting: company.posting
        }
      });
      companiesCreated++;
      console.log(`  + Created: ${company.name}`);
    }
  }

  // Import contacts
  console.log('\n👥 Importing contacts...');
  let contactsCreated = 0;
  let contactsSkipped = 0;

  for (const contact of contacts) {
    // Find employer by name
    const employer = await prisma.employer.findFirst({
      where: { name: contact.company }
    });

    if (!employer) {
      console.log(`  ⚠️  Skipped ${contact.name} - Employer "${contact.company}" not found`);
      contactsSkipped++;
      continue;
    }

    // Check if contact already exists for this employer
    const existing = await prisma.contact.findFirst({
      where: {
        employerId: employer.id,
        name: contact.name
      }
    });

    if (existing) {
      contactsSkipped++;
      console.log(`  ⊘ Already exists: ${contact.name} at ${contact.company}`);
    } else {
      await prisma.contact.create({
        data: {
          employerId: employer.id,
          name: contact.name,
          title: contact.title,
          linkedInUrl: contact.linkedInUrl,
          email: contact.email,
          notes: contact.notes
        }
      });
      contactsCreated++;
      console.log(`  + Created: ${contact.name} at ${contact.company}`);
    }
  }

  console.log('\n✅ Import complete!');
  console.log(`   Companies: ${companiesCreated} created, ${companiesSkipped} updated/skipped`);
  console.log(`   Contacts: ${contactsCreated} created, ${contactsSkipped} skipped`);
}

main()
  .catch((e) => {
    console.error('Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
