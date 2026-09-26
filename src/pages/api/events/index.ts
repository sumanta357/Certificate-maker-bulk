// GET /api/events — list events for the current organization
// POST /api/events — create a new event
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, ApiError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { slugify, optionalEmail } from "@/lib/utils";

const createSchema = z.object({
  name: z.string().min(2).max(200),
  organizationDisplay: z.string().max(200).optional(),
  eventDate: z.string().datetime().or(z.string()).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  organizer: z.string().max(160).nullable().optional(),
  certificateType: z.string().max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  contactEmail: optionalEmail,
  idPrefix: z.string().max(16).optional(),
  testMode: z.boolean().optional(),
  testEmail: optionalEmail,
  templateId: z.string().nullable().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const { user, organization } = await requireAuth(req);
      void user;
      const events = await prisma.event.findMany({
        where: { organizationId: organization.id },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { participants: true } },
        },
      });
      const withStats = await Promise.all(
        events.map(async (e) => {
          const [generated, sent, failed] = await Promise.all([
            prisma.participant.count({ where: { eventId: e.id, status: { in: ["GENERATED", "QUEUED", "SENDING", "SENT"] } } }),
            prisma.participant.count({ where: { eventId: e.id, status: "SENT" } }),
            prisma.participant.count({ where: { eventId: e.id, status: "FAILED" } }),
          ]);
          return { ...e, stats: { participants: e._count.participants, generated, sent, failed } };
        })
      );
      return res.status(200).json({ events: withStats });
    }

    if (req.method === "POST") {
      const { user, organization } = await requireRole(req, "EDITOR");
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
      }
      const d = parsed.data;
      let slug = slugify(d.name);
      const clash = await prisma.event.findUnique({
        where: { organizationId_slug: { organizationId: organization.id, slug } },
      });
      if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

      const event = await prisma.event.create({
        data: {
          organizationId: organization.id,
          name: d.name,
          slug,
          organizationDisplay: d.organizationDisplay || organization.name,
          eventDate: d.eventDate ? new Date(d.eventDate) : null,
          location: d.location || null,
          organizer: d.organizer || null,
          certificateType: d.certificateType || "Certificate of Participation",
          description: d.description || null,
          website: d.website || null,
          contactEmail: d.contactEmail || null,
          idPrefix: d.idPrefix || organization.idPrefix,
          testMode: d.testMode ?? false,
          testEmail: d.testEmail || null,
          templateId: d.templateId || null,
        },
      });

      await prisma.emailTemplate.create({
        data: {
          organizationId: organization.id,
          eventId: event.id,
          subject: "Your {{CERTIFICATE_TYPE}} – {{EVENT_NAME}}",
          body: `Dear {{Name}},\n\nThank you for participating in {{EVENT_NAME}}.\n\nPlease find your certificate attached.\n\nCertificate ID: {{CERTIFICATE_ID}}\nVerify online: {{VERIFICATION_URL}}\n\nRegards,\n{{ORGANIZATION}}`,
        },
      });

      await audit({
        organizationId: organization.id,
        userId: user.id,
        action: "event.created",
        entityType: "Event",
        entityId: event.id,
        metadata: { name: event.name },
        req,
      });

      return res.status(201).json({ event });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error("[api/events]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
