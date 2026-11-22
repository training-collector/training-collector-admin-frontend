import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Bell, Users, Dumbbell, Flag, LogOut, Plus, X, Inbox } from 'lucide-react';
import { request, Unauthorized, type Trainer, type Item, type Section } from './api';
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
function Brand() {
  return (
    <div className="brand">
      <img src="/training-collector.png" alt="" />
      Training Collector
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
type Action = { kind: 'edit'; item?: Item } | { kind: 'delete' | 'deactivate'; id: number; name: string };
function Workspace({ token, leave }: { token: string; leave: (message?: string) => void }) {
  const [section, setSection] = useState<Section>('requests'),
    [version, refresh] = useState(0);
  const [rows, setRows] = useState<(Trainer | Item)[] | null>(null),
    [action, setAction] = useState<Action>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState('');
  const people = section === 'trainers' || section === 'requests';
  const path = people ? '/trainers' : '/' + section;
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const list = await request<(Item | Trainer)[]>(path, token, 'GET', undefined, controller.signal);
        if (!controller.signal.aborted) {
          setRows(list);
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
    const onFocus = () => {
      if (!document.hidden) void load();
    };
    const timer = window.setInterval(onFocus, 10000);
    window.addEventListener('focus', onFocus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [path, token, version, leave]);
  function select(next: Section) {
    if (next === section || busy) return;
    if (path !== (['requests', 'trainers'].includes(next) ? '/trainers' : '/' + next)) setRows(null);
    setSection(next);
    setError('');
    setLoadError('');
    setAction(undefined);
  }
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
  const noun = section === 'goals' ? 'цель' : 'упражнение';
  const editTitle = action?.kind === 'edit' && action.item ? 'Редактировать' : 'Добавить';
  return (
    <div className="shell">
      <aside>
        <Brand />
        <nav aria-label="Администрирование">
          {(Object.keys(sections) as Section[]).map((key) => {
            const { label, icon: Icon } = sections[key];
            return (
              <button
                key={key}
                aria-current={key === section ? 'page' : undefined}
                disabled={busy}
                onClick={() => select(key)}
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
            <span className="context">Администрирование</span>
            <h1>{sections[section].label}</h1>
          </div>
          {!people && (
            <button
              className="primary"
              onClick={() => {
                setError('');
                setAction({ kind: 'edit' });
              }}
            >
              <Plus size={16} />
              Добавить {noun}
            </button>
          )}
        </header>
        {loadError && (
          <p role="alert">
            {loadError} <button onClick={() => refresh((n) => n + 1)}>Повторить</button>
          </p>
        )}
        {!action && error && <p role="alert">{error}</p>}
        {rows === null ? (
          !loadError && <p role="status">Загрузка…</p>
        ) : !(people ? trainers?.length : items?.length) ? (
          <div className="empty">
            <Inbox size={27} />
            <h2>{section === 'requests' ? 'Новых заявок нет' : 'Список пуст'}</h2>
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
                            <span className="status">Деактивирован</span>
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
              : items?.map((item) => (
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
            action.kind === 'edit'
              ? editTitle + ' ' + noun
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
          {action.kind === 'edit' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                const item = action.item;
                void mutate(item ? path + '/' + item.id : path, item ? 'PUT' : 'POST', {
                  name: d.get('name'),
                  description: d.get('description'),
                  hidden: item?.hidden ?? false,
                });
              }}
            >
              <label>
                Название
                <input
                  name="name"
                  autoFocus
                  required
                  maxLength={section === 'goals' ? 128 : 255}
                  defaultValue={action.item?.name}
                />
              </label>
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
function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(sessionKey) || ''),
    [notice, setNotice] = useState('');
  const leave = useCallback((msg = '') => {
    sessionStorage.removeItem(sessionKey);
    setToken('');
    setNotice(msg);
  }, []);
  return token ? (
    <Workspace token={token} leave={leave} />
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
