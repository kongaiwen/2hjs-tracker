import { PrismaClient, TemplateType } from '@prisma/client';

const prisma = new PrismaClient();

const templates = [
  {
    name: "Climate Tech Initial Outreach",
    type: "SIX_POINT_NO_CONNECTION",
    subject: "Climate tech pivot — seeking your perspective",
    body: `Hi {{contactName}},

I came across your profile while researching {{employerName}}'s climate work and wanted to reach out.

I'm a software engineer actively looking to pivot into climate tech — I've been following the space closely and feel strongly about contributing to the mission, but I'm still figuring out how my background translates best.

Your work on {{employerName}}'s climate mission stood out to me. Would you be open to a brief 15-minute chat? I'd value your perspective on how my skillset might apply in this context and what you've learned from your transition.

I know you're busy, so totally understand if not. But if you're open, I'd really appreciate the insight.

Best,
{{yourName}}`,
    variables: ["contactName", "employerName", "yourName"],
    isDefault: false,
  },
  {
    name: "Accessibility/Neurodivergent Tech Outreach",
    type: "SIX_POINT_NO_CONNECTION",
    subject: "Accessibility advocacy + {{employerName}}",
    body: `Hi {{contactName}},

I've been following {{employerName}}'s work in the accessibility space and wanted to connect.

As someone who cares deeply about building inclusive tech — especially neurodivergent-friendly tools and practices — I'm really encouraged by what I'm seeing in this space. Your role caught my eye as someone working on these important issues.

Would you have 15 minutes for a brief informational? I'd love to hear your perspective on accessibility priorities at {{employerName}} and learn more about the team's approach.

No pressure at all — I know time is scarce. But if you're open, I'd really appreciate it.

Thanks for considering,
{{yourName}}`,
    variables: ["contactName", "employerName", "yourName"],
    isDefault: false,
  },
  {
    name: "EdTech Initial Outreach",
    type: "SIX_POINT_NO_CONNECTION",
    subject: "{{employerName}}'s learning impact",
    body: `Hi {{contactName}},

I came across your work at {{employerName}} and wanted to reach out.

As someone passionate about education technology and how it can transform learning outcomes, I've been really impressed by {{employerName}}'s approach. Your role stood out to me as someone shaping this mission.

Would you be open to a brief 15-minute chat? I'd love to learn about your experience at {{employerName}} and hear your thoughts on where edtech is heading.

I completely understand if your schedule doesn't allow for it right now. But if you're open, I'd really value the conversation.

Best regards,
{{yourName}}`,
    variables: ["contactName", "employerName", "yourName"],
    isDefault: false,
  },
];

async function main() {
  console.log('Creating outreach templates...\n');

  for (const template of templates) {
    const wordCount = template.body.split(/\s+/).length;

    const created = await prisma.emailTemplate.create({
      data: {
        ...template,
        wordCount,
        type: template.type as TemplateType,
      },
    });

    console.log(`✓ Created: ${created.name}`);
    console.log(`  Type: ${created.type}`);
    console.log(`  Subject: ${created.subject}`);
    console.log(`  Word Count: ${wordCount}`);
    console.log(`  Variables: ${created.variables.join(', ')}`);
    console.log('');
  }

  console.log('✅ Templates created successfully!');
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
