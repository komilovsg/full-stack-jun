import { describe, it, expect, vi, beforeEach } from 'vitest';
import { User } from './User';
import type { UserData } from './User';

// Мокаем pgPool
vi.mock('../config/database', () => ({
  pgPool: {
    query: vi.fn(),
  },
}));

describe('User Model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('должен находить пользователя по telegram_id', async () => {
    const { pgPool } = await import('../config/database');
    
    const mockUser: UserData = {
      id: 1,
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(pgPool.query).mockResolvedValueOnce({
      rows: [mockUser],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any);

    const result = await User.findByTelegramId(123456789);

    expect(result).not.toBeNull();
    expect(result?.telegram_id).toBe(123456789);
    expect(result?.username).toBe('testuser');
    expect(pgPool.query).toHaveBeenCalledWith(
      'SELECT * FROM users WHERE telegram_id = $1',
      [123456789]
    );
  });

  it('должен возвращать null если пользователь не найден', async () => {
    const { pgPool } = await import('../config/database');

    vi.mocked(pgPool.query).mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any);

    const result = await User.findByTelegramId(999999999);

    expect(result).toBeNull();
    expect(pgPool.query).toHaveBeenCalledWith(
      'SELECT * FROM users WHERE telegram_id = $1',
      [999999999]
    );
  });

  it('должен находить пользователя по username', async () => {
    const { pgPool } = await import('../config/database');
    
    const mockUser: UserData = {
      id: 2,
      telegram_id: 987654321,
      username: 'anotheruser',
      first_name: 'Another',
      last_name: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(pgPool.query).mockResolvedValueOnce({
      rows: [mockUser],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any);

    const result = await User.findByUsername('anotheruser');

    expect(result).not.toBeNull();
    expect(result?.username).toBe('anotheruser');
    expect(pgPool.query).toHaveBeenCalledWith(
      'SELECT * FROM users WHERE username = $1',
      ['anotheruser']
    );
  });
});
