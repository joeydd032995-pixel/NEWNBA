import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prismaStub: any;

  beforeEach(() => {
    prismaStub = {
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      alert: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eVMetrics: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const dataIngestionStub = {} as any;
    const injuryIngestStub = {} as any;
    const evServiceStub = { getEVFeed: jest.fn().mockResolvedValue([]) } as any;
    const arbitrageServiceStub = {
      getArbitrageOpportunities: jest.fn().mockResolvedValue([]),
    } as any;

    service = new NotificationsService(
      prismaStub,
      dataIngestionStub,
      injuryIngestStub,
      evServiceStub,
      arbitrageServiceStub,
    );
  });

  describe('getUnread', () => {
    it('returns only unread notifications ordered by desc createdAt, limited', async () => {
      const notifications = [
        { id: 'notif-1', userId: 'user-1', isRead: false, createdAt: new Date('2024-01-02') },
        { id: 'notif-2', userId: 'user-1', isRead: false, createdAt: new Date('2024-01-01') },
      ];
      prismaStub.notification.findMany.mockResolvedValue(notifications);

      const result = await service.getUnread('user-1', 30);

      expect(prismaStub.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      expect(result).toEqual(notifications);
    });

    it('uses default limit of 30 when not specified', async () => {
      prismaStub.notification.findMany.mockResolvedValue([]);

      await service.getUnread('user-1');

      expect(prismaStub.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 30 }),
      );
    });
  });

  describe('getAll', () => {
    it('returns all notifications ordered by desc createdAt, limited', async () => {
      const notifications = [
        { id: 'notif-1', userId: 'user-1', isRead: true },
        { id: 'notif-2', userId: 'user-1', isRead: false },
      ];
      prismaStub.notification.findMany.mockResolvedValue(notifications);

      const result = await service.getAll('user-1', 50);

      expect(prismaStub.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('getUnreadCount', () => {
    it('returns correct unread count', async () => {
      prismaStub.notification.count.mockResolvedValue(7);

      const result = await service.getUnreadCount('user-1');

      expect(prismaStub.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
      });
      expect(result).toEqual({ count: 7 });
    });

    it('returns zero when no unread notifications', async () => {
      prismaStub.notification.count.mockResolvedValue(0);

      const result = await service.getUnreadCount('user-1');

      expect(result).toEqual({ count: 0 });
    });
  });

  describe('markRead', () => {
    it('updates single notification isRead=true scoped to userId', async () => {
      prismaStub.notification.updateMany.mockResolvedValue({ count: 1 });

      await service.markRead('notif-1', 'user-1');

      expect(prismaStub.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1' },
        data: { isRead: true },
      });
    });
  });

  describe('markAllRead', () => {
    it('batch updates all unread notifications for user and returns count', async () => {
      prismaStub.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllRead('user-1');

      expect(prismaStub.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        data: { isRead: true },
      });
      expect(result).toEqual({ marked: 5 });
    });

    it('returns zero when no unread notifications to mark', async () => {
      prismaStub.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllRead('user-1');

      expect(result).toEqual({ marked: 0 });
    });
  });
});
