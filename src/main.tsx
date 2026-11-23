import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Bell, Users, Dumbbell, Flag, LogOut, Plus, X, Inbox, ChevronRight, Pencil } from 'lucide-react';
import { request, Unauthorized, type Trainer, type Item, type MuscleGroup, type Section } from './api';
import './style.css';

const sessionKey = 'training-collector.admin.session';
const sections = {
  requests: { label: 'Заявки', icon: Bell },
  trainers: { label: 'Тренеры', icon: Users },
  exercises: { label: 'Упражнения', icon: Dumbbell },
  goals: { label: 'Цели', icon: Flag },
};
const date = (value: string) =>
  new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="brand">
      <img src="/training-collector.png" alt="" />
      <span>Training Collector{subtitle && <small>{subtitle}</small>}</span>
    </div>
  );
}
function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby="dialog-title"
    >
      <header>
        <h2 id="dialog-title">{title}</h2>
        <button aria-label="Закрыть" onClick={close}>
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Login({ enter, notice }: { enter: (t: string) => void; notice: string }) {
  const [error, setError] = useState(notice),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const { token } = await request<{ token: string }>('/login', '', 'POST', Object.fromEntries(data));
      enter(token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <Brand />
      <section>
        <h1>Вход администратора</h1>
        <form onSubmit={submit}>
          <label>
            Логин
            <input autoFocus name="login" required autoComplete="username" />
          </label>
          <label>
            Пароль
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          {error && <p role="alert">{error}</p>}
          <button className="primary" disabled={busy}>
            Войти
          </button>
        </form>
      </section>
    </main>
  );
}
type Action =
  | { kind: 'edit'; item?: Item }
  | { kind: 'category'; item?: MuscleGroup }
  | { kind: 'delete' | 'deactivate'; id: number; name: string };
function Workspace({ token, leave, section, groupId }: {
  token: string; leave: (message?: string) => void; section: Section; groupId: number | null;
}) {
  const [version, refresh] = useState(0);
  const [groups, setGroups] = useState<MuscleGroup[] | null>(null);
  const [page, setPage] = useState<{ path: string; rows: (Trainer | Item)[] }>();
  const [action, setAction] = useState<Action>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState('');
  const people = section === 'trainers' || section === 'requests';
  const categories = section === 'exercises' && groupId === null;
  const path = people ? '/trainers' : categories ? '/muscle-groups' : '/' + section;
  const listPath = groupId === null ? path : '/muscle-groups/' + groupId + '/exercises';
  const group = groups?.find(g => g.id === groupId);
  const rows = page?.path === listPath ? page.rows : null;
  useEffect(() => {
    setAction(undefined);
    setError('');
    setLoadError('');
  }, [listPath]);
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const [list, options] = await Promise.all([
          categories ? null : request<(Item | Trainer)[]>(listPath, token, 'GET', undefined, controller.signal),
          section === 'exercises' ? request<MuscleGroup[]>('/muscle-groups', token, 'GET', undefined, controller.signal) : null,
        ]);
        if (!controller.signal.aborted) {
          if (list) setPage({ path: listPath, rows: list });
          if (options) setGroups(options);
          setLoadError('');
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          if (e instanceof Unauthorized) leave(e.message);
          else setLoadError((e as Error).message);
        }
      } finally {
        loading = false;
      }
    }
    void load();
    let lastActivity = Date.now();
    const interacted = () => { lastActivity = Date.now(); };
    const onFocus = () => {
      interacted();
      if (!document.hidden) void load();
    };
    const timer = window.setInterval(() => {
      if (!document.hidden && Date.now() - lastActivity < 5 * 60_000) void load();
    }, 30_000);
    window.addEventListener('pointerdown', interacted);
    window.addEventListener('keydown', interacted);
    window.addEventListener('focus', onFocus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('pointerdown', interacted);
      window.removeEventListener('keydown', interacted);
      window.removeEventListener('focus', onFocus);
    };
  }, [listPath, categories, section, token, version, leave]);
  async function mutate(url: string, method: string, body?: unknown) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await request(url, token, method, body);
      setAction(undefined);
      refresh((n) => n + 1);
    } catch (e) {
      if (e instanceof Unauthorized) leave(e.message);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const trainers = people
    ? (rows as Trainer[] | null)?.filter((t) =>
        section === 'requests' ? !t.approvedAt && !t.deactivatedAt : t.approvedAt || t.deactivatedAt,
      )
    : [];
  const items = people ? [] : (rows as Item[] | null);
  const records = categories ? groups : people ? trainers : items;
  const noun = categories ? 'категорию' : section === 'goals' ? 'цель' : 'упражнение';
  function editCategory(item: MuscleGroup) {
    setError('');
    setAction({ kind: 'category', item });
  }
  return (
    <div className="shell">
      <aside>
        <Brand subtitle="Admin Panel" />
        <nav aria-label="Администрирование">
          {(Object.keys(sections) as Section[]).map((key) => {
            const { label, icon: Icon } = sections[key];
            return (
              <button
                key={key}
                aria-current={key === section ? 'page' : undefined}
                disabled={busy}
                onClick={() => { window.location.hash = key; }}
              >
                <Icon size={18} />
                {label}
              </button>
            );
          })}
        </nav>
        <button
          className="logout"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await request('/logout', token, 'POST');
              leave();
            } catch (e) {
              if (e instanceof Unauthorized) leave();
              else setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <LogOut size={16} />
          Выйти
        </button>
      </aside>
      <main className="content">
        <header>
          <div>
            {groupId !== null ? <a className="context" href="#exercises">← К категориям</a>
              : <span className="context">Администрирование</span>}
            <h1>{groupId === null ? sections[section].label : group?.name ?? (rows && groups ? 'Категория не найдена' : 'Категория')}</h1>
            {group?.description && <p className="group-description">{group.description}</p>}
          </div>
          {!people && (groupId === null || group) && (
            <div className="actions">
              {group && <button disabled={busy} onClick={() => editCategory(group)}>
                <Pencil size={15} aria-hidden="true" /> Изменить категорию
              </button>}
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  setError('');
                  setAction({ kind: categories ? 'category' : 'edit' });
                }}
              >
                <Plus size={16} />
                Добавить {noun}
              </button>
            </div>
          )}
        </header>
        {loadError && (
          <p role="alert">
            {loadError} <button onClick={() => refresh((n) => n + 1)}>Повторить</button>
          </p>
        )}
        {!action && error && <p role="alert">{error}</p>}
        {records == null ? (
          !loadError && <p role="status">Загрузка…</p>
        ) : !records.length ? (
          <div className="empty">
            <Inbox size={27} />
            <h2>{categories ? 'Категорий пока нет' : groupId !== null ? 'В категории пока нет упражнений' : section === 'requests' ? 'Новых заявок нет' : 'Список пуст'}</h2>
            {section === 'requests' && <p>Здесь появляются тренеры, запустившие бота авторизации.</p>}
          </div>
        ) : (
          <ul className="records">
            {people
              ? trainers?.map((t) => (
                  <li key={t.id}>
                    <div>
                      <strong>{t.fullName}</strong>
                      <p>
                        {t.username} · {date(t.deactivatedAt || t.approvedAt || t.telegramLinkedAt)}
                      </p>
                    </div>
                    <div className="actions">
                      {section === 'requests' ? (
                        <button
                          disabled={busy}
                          className="primary"
                          onClick={() => mutate(path + '/' + t.id + '/approve', 'POST')}
                        >
                          Одобрить
                        </button>
                      ) : (
                        <>
                          {t.deactivatedAt ? (
                            <>
                              <span className="status">Деактивирован</span>
                              <button disabled={busy} onClick={() => mutate(path + '/' + t.id + '/activate', 'POST')}>Активировать</button>
                            </>
                          ) : (
                            <button
                              disabled={busy}
                              onClick={() => {
                                setError('');
                                setAction({ kind: 'deactivate', id: t.id, name: t.fullName });
                              }}
                            >
                              Деактивировать
                            </button>
                          )}
                          <button
                            disabled={busy}
                            onClick={() => {
                              setError('');
                              setAction({ kind: 'delete', id: t.id, name: t.fullName });
                            }}
                          >
                            Удалить
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))
              : categories ? groups?.map(g => <li key={g.id} className="category-row">
                  <a className="category-link" href={'#exercises/' + g.id}>
                    <span className="category-copy"><strong>{g.name}</strong>
                      {g.description && <span className="category-summary">{g.description}</span>}
                    </span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </a>
                  <button className="category-edit" disabled={busy} aria-label={'Изменить категорию «' + g.name + '»'}
                    onClick={() => editCategory(g)}><Pencil size={15} aria-hidden="true" /> Изменить</button>
                </li>) : items?.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      {item.description && <p>{item.description}</p>}
                      {item.hidden && <span className="status">Скрыто</span>}
                    </div>
                    <div className="actions">
                      <button
                        disabled={busy}
                        onClick={() => {
                          setError('');
                          setAction({ kind: 'edit', item });
                        }}
                      >
                        Изменить
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          mutate(path + '/' + item.id, 'PUT', {
                            name: item.name,
                            description: item.description,
                            muscleGroupId: item.muscleGroupId,
                            hidden: !item.hidden,
                          })
                        }
                      >
                        {item.hidden ? 'Показать' : 'Скрыть'}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setError('');
                          setAction({ kind: 'delete', id: item.id, name: item.name });
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </li>
                ))}
          </ul>
        )}
      </main>
      {action && (
        <Modal
          title={
            action.kind === 'category' || action.kind === 'edit'
              ? (action.item ? 'Редактировать ' : 'Добавить ') + (action.kind === 'category' ? 'категорию' : noun)
              : action.kind === 'delete'
                ? 'Удалить запись?'
                : 'Деактивировать тренера?'
          }
          close={() => {
            if (!busy) {
              setAction(undefined);
              setError('');
            }
          }}
        >
          {action.kind === 'edit' || action.kind === 'category' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                const fields = { name: d.get('name'), description: d.get('description') };
                if (action.kind === 'category') {
                  const url = action.item ? '/muscle-groups/' + action.item.id : '/muscle-groups';
                  void mutate(url, action.item ? 'PUT' : 'POST', fields);
                  return;
                }
                const item = action.item;
                void mutate(item ? path + '/' + item.id : path, item ? 'PUT' : 'POST', {
                  ...fields,
                  hidden: item?.hidden ?? false,
                  muscleGroupId: groupId === null ? undefined : Number(d.get('muscleGroupId') ?? groupId),
                });
              }}
            >
              <label>
                Название
                <input
                  name="name"
                  autoFocus
                  required
                  maxLength={action.kind === 'category' || section === 'goals' ? 128 : 255}
                  defaultValue={action.item?.name}
                />
              </label>
              {action.kind === 'edit' && groupId !== null && action.item && <label>Группа мышц
                <select name="muscleGroupId" required defaultValue={action.item.muscleGroupId}>
                  {groups?.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>}
              {section === 'exercises' && (
                <label>
                  Описание
                  <textarea name="description" rows={4} defaultValue={action.item?.description ?? ''} />
                </label>
              )}
              {error && <p role="alert">{error}</p>}
              <button className="primary" disabled={busy}>
                Сохранить
              </button>
            </form>
          ) : (
            <>
              <p>
                <strong>{action.name}</strong>
              </p>
              <p>
                {action.kind === 'deactivate'
                  ? 'Доступ в кабинет и к обоим ботам будет закрыт.'
                  : people
                    ? 'Аккаунт, подопечные, их тренировки и замеры будут удалены без возможности восстановления.'
                    : 'Запись исчезнет из справочника. Ранее записанные данные сохранятся.'}
              </p>
              {error && <p role="alert">{error}</p>}
              <div className="actions">
                <button disabled={busy} onClick={() => setAction(undefined)}>
                  Отмена
                </button>
                <button
                  disabled={busy}
                  className="primary"
                  onClick={() =>
                    mutate(
                      path + '/' + action.id + (action.kind === 'deactivate' ? '/deactivate' : ''),
                      action.kind === 'delete' ? 'DELETE' : 'POST',
                    )
                  }
                >
                  {action.kind === 'delete' ? 'Удалить' : 'Деактивировать'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function subscribeToRoute(change: () => void) {
  window.addEventListener('hashchange', change);
  return () => window.removeEventListener('hashchange', change);
}
function App() {
  const hash = useSyncExternalStore(subscribeToRoute, () => window.location.hash);
  const category = /^#exercises\/([1-9]\d*)$/.exec(hash);
  const groupId = category && Number.isSafeInteger(Number(category[1])) ? Number(category[1]) : null;
  const page = hash.slice(1);
  const section = groupId !== null ? 'exercises' : Object.hasOwn(sections, page) ? page as Section : 'requests';
  const [token, setToken] = useState(() => sessionStorage.getItem(sessionKey) || ''),
    [notice, setNotice] = useState('');
  const leave = useCallback((msg = '') => {
    sessionStorage.removeItem(sessionKey);
    setToken('');
    setNotice(msg);
  }, []);
  return token ? (
    <Workspace key={section} token={token} leave={leave} section={section} groupId={groupId} />
  ) : (
    <Login
      notice={notice}
      enter={(t) => {
        sessionStorage.setItem(sessionKey, t);
        setToken(t);
      }}
    />
  );
}
createRoot(document.getElementById('root')!).render(<App />);
