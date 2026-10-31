"use client";
import Link from "next/link";
import { websiteBaseUrl } from "./site-url";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CarFront,
  Globe2,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  X,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
export function WebShell({
  children,
  email,
  fixture,
}: {
  children: ReactNode;
  email?: string;
  fixture: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const closeMenu = () => {
    setOpen(false);
    menu.current?.focus();
  };
  return (
    <div className="web-workspace">
      <aside
        id="web-sidebar"
        className={`web-sidebar ${open ? "is-open" : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") closeMenu();
        }}
      >
        <button
          className="web-sidebar-close"
          aria-label="Close website navigation"
          onClick={closeMenu}
        >
          <X size={18} />
        </button>
        <Link href="/web" className="web-brand">
          <span>MMG</span>
          <small>CONCIERGE</small>
        </Link>
        <div className="web-workspace-switch">
          <Link href="/">
            <LayoutDashboard size={15} />
            App operations
          </Link>
          <Link href="/web" aria-current="page">
            <Globe2 size={15} />
            Website
          </Link>
        </div>
        <div className="web-nav-caption">MANAGE</div>
        <nav aria-label="Website navigation">
          <Link
            href="/web"
            aria-current={pathname.startsWith("/web") ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <CarFront size={17} />
            Vehicles<span>01</span>
          </Link>
        </nav>
        <div className="web-sidebar-bottom">
          <a href={websiteBaseUrl} target="_blank" rel="noreferrer">
            View website
            <ArrowUpRight size={15} />
          </a>
          <div className="web-staff">
            <span className="web-avatar">
              {(email || "M")[0].toUpperCase()}
            </span>
            <div>
              <strong>{email || "MMG administrator"}</strong>
              <small>{fixture ? "Local preview" : "Staff workspace"}</small>
            </div>
          </div>
          <button
            className="web-signout"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/sign-in");
              router.refresh();
            }}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="web-main">
        <header className="web-topbar">
          <button
            aria-label={
              open ? "Close website navigation" : "Open website navigation"
            }
            aria-expanded={open}
            aria-controls="web-sidebar"
            ref={menu}
            onClick={() => setOpen(!open)}
          >
            <PanelLeft size={19} />
          </button>
          <span>
            MMG Concierge<span className="web-top-divider">/</span>
            <strong>Website</strong>
          </span>
          <span className="web-environment">
            <i />
            {fixture ? "Local preview" : "Website workspace"}
          </span>
        </header>
        {fixture && (
          <div className="web-preview-note">
            Preview data · Changes stay in this local workspace and do not
            update mmgconcierge.com.
          </div>
        )}
        <main className="web-content" id="web-content">
          {children}
        </main>
        <footer className="web-workspace-footer">
          <span>MMG Concierge</span>
          <span>Website management</span>
        </footer>
      </div>
    </div>
  );
}
