"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Mail, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/web-ui/button";
import { Input } from "@/components/web-ui/input";
import { webRequest } from "./api";
import type { Subscriber } from "../newsletter";
type Page = { items: Subscriber[]; nextCursor: string | null };
export function WebSubscribers() {
  const [data, setData] = useState<Page>({ items: [], nextCursor: null });
  const [cursor, setCursor] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [remove, setRemove] = useState<Subscriber | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    let active = true;
    webRequest<Page>(
      `subscribers?${new URLSearchParams({ cursor, email: query })}`,
    )
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cursor, query, refresh]);
  function reload() {
    setLoading(true);
    setError("");
    setRefresh((value) => value + 1);
  }
  function closeDialog() {
    dialog.current?.close();
    setRemove(null);
    removeTrigger.current?.focus();
  }
  async function exportList() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/web/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export" }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).error || "Export failed. Try again.",
        );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "mmg-newsletter-subscribers.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Subscriber list exported. Store this file securely.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="web-page-heading">
        <div>
          <div className="web-breadcrumb">
            Website <span>/</span> Newsletter
          </div>
          <h1>
            Subscribers<span>.</span>
          </h1>
          <p>
            Email signups from your website. Collect now; send newsletters when
            you’re ready.
          </p>
        </div>
        <Button onClick={exportList} disabled={busy || loading}>
          <Download size={16} />
          {busy ? "Please wait…" : "Export all subscribers"}
        </Button>
      </div>
      <div className="web-newsletter-note">
        <Mail size={18} />
        <p>
          These addresses have not been verified by email. No welcome messages
          or campaigns are sent from this workspace.
        </p>
      </div>
      <div className="web-list-toolbar">
        <form
          className="web-subscriber-search"
          onSubmit={(event) => {
            event.preventDefault();
            setLoading(true);
            setError("");
            setCursor("");
            setHistory([]);
            setQuery(search.trim());
            setRefresh((value) => value + 1);
          }}
        >
          <label className="web-search">
            <Search size={16} />
            <Input
              aria-label="Find subscriber by exact email"
              type="email"
              placeholder="Find an exact email address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" disabled={loading}>
            Find
          </Button>
          {query && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setLoading(true);
                setSearch("");
                setQuery("");
                setCursor("");
                setHistory([]);
                setError("");
              }}
            >
              Clear
            </Button>
          )}
        </form>
        <Button
          variant="ghost"
          aria-label="Refresh subscribers"
          disabled={loading}
          onClick={reload}
        >
          <RefreshCw size={16} />
        </Button>
      </div>
      {error && (
        <p className="web-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="web-notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="web-subscriber-empty" role="status">
          Loading subscribers…
        </p>
      ) : error ? (
        <div className="web-subscriber-empty">
          <p>
            We couldn’t load the list. Your subscribers haven’t been changed.
          </p>
          <Button onClick={reload} variant="outline">
            Try again
          </Button>
        </div>
      ) : data.items.length ? (
        <div className="web-subscriber-table-wrap">
          <table className="web-subscriber-table">
            <caption className="web-sr-only">Newsletter subscribers</caption>
            <thead>
              <tr>
                <th scope="col">Email address</th>
                <th scope="col">Joined</th>
                <th scope="col">Consent</th>
                <th scope="col">
                  <span className="web-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.email}
                    <small>Website signup · Email unverified</small>
                  </td>
                  <td>
                    <time dateTime={item.createdAt}>
                      {new Intl.DateTimeFormat("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        timeZone: "Africa/Lagos",
                      }).format(new Date(item.createdAt))}
                    </time>
                  </td>
                  <td>
                    <details>
                      <summary>View consent</summary>
                      <p>{item.consentText}</p>
                      <small>
                        {item.consentVersion} ·{" "}
                        {new Date(item.createdAt).toISOString()}
                      </small>
                    </details>
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Remove ${item.email}`}
                      onClick={(event) => {
                        removeTrigger.current = event.currentTarget;
                        setRemove(item);
                        dialog.current?.showModal();
                      }}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="web-subscriber-empty">
          <Mail size={26} />
          <h2>
            {query ? "No matching subscriber." : "Your list starts here."}
          </h2>
          <p>
            {query
              ? "Try another email address, or clear your search."
              : "People who join through your website will appear here with their signup consent."}
          </p>
        </div>
      )}
      <div className="web-subscriber-pagination">
        <span>
          {history.length ? `Page ${history.length + 1}` : "Page 1"} · Up to 50
          subscribers per page
        </span>
        <div>
          <Button
            variant="outline"
            disabled={!history.length || loading}
            onClick={() => {
              setLoading(true);
              setError("");
              setCursor(history[history.length - 1]);
              setHistory(history.slice(0, -1));
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={!data.nextCursor || loading || !!error}
            onClick={() => {
              setLoading(true);
              setError("");
              setHistory([...history, cursor]);
              setCursor(data.nextCursor!);
            }}
          >
            Next
          </Button>
        </div>
      </div>
      <dialog
        className="web-subscriber-dialog"
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) closeDialog();
        }}
        aria-labelledby="remove-subscriber-title"
      >
        <h2 id="remove-subscriber-title">Remove subscriber?</h2>
        <p>
          {remove?.email} will be removed from this list. They can join again
          through the website.
        </p>
        <div>
          <Button variant="outline" disabled={busy} onClick={closeDialog}>
            Keep subscriber
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              if (!remove) return;
              setBusy(true);
              setError("");
              try {
                await webRequest("subscribers", {
                  method: "POST",
                  body: JSON.stringify({ action: "remove", id: remove.id }),
                });
                closeDialog();
                setNotice("Subscriber removed.");
                setCursor("");
                setHistory([]);
                reload();
              } catch (e) {
                closeDialog();
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove subscriber
          </Button>
        </div>
      </dialog>
    </>
  );
}
