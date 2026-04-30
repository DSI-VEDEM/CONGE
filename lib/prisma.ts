import { PrismaClient } from "@/generated/prisma/client";
import {
  notificationEmailRecordsFromCreateManyData,
  sendNotificationEmailsInBackground,
} from "@/lib/notification-emails";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prismaClient = globalForPrisma.prisma ?? new PrismaClient();

const prismaWithNotificationEmails = prismaClient.$extends({
  query: {
    notification: {
      async create({ args, query }) {
        const notification = await query(args);
        const createdNotifications = notificationEmailRecordsFromCreateManyData(notification);
        const notifications =
          createdNotifications.length > 0 ? createdNotifications : notificationEmailRecordsFromCreateManyData(args.data);
        sendNotificationEmailsInBackground(prismaClient, notifications);
        return notification;
      },
      async createMany({ args, query }) {
        const result = await query(args);
        const notifications = notificationEmailRecordsFromCreateManyData(args.data);
        sendNotificationEmailsInBackground(prismaClient, notifications);
        return result;
      },
    },
  },
});

export const prisma = prismaWithNotificationEmails as unknown as PrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prismaClient;
