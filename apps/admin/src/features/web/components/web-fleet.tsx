"use client";
/* eslint-disable @next/next/no-img-element -- Staff photos use authenticated media routes and editorial reference URLs. */
import Link from "next/link";
import { websiteBaseUrl } from "./site-url";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CarFront,
  Check,
  ImagePlus,
  Loader2,
  Plus,
  Search,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/web-ui/button";
import { Input } from "@/components/web-ui/input";
import { Badge } from "@/components/web-ui/badge";
import { photoUrl, type WebStatus, type WebVehicle } from "../model";
import { webRequest } from "./api";
export const statusLabels: Record<WebStatus, string> = {
  draft: "Draft",
  published: "Published",
  hidden: "Hidden",
  archived: "Archived",
};
export function WebFleet() {
  const [items, setItems] = useState<WebVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const load = async () => {
    setError("");
    try {
      const data = await webRequest<{ vehicles: WebVehicle[] }>("vehicles");
      setItems(data.vehicles);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    webRequest<{ vehicles: WebVehicle[] }>("vehicles")
      .then((data) => {
        if (active) setItems(data.vehicles);
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
  }, []);
  const visible = items.filter(
    (v) =>
      (filter === "all" || v.status === filter) &&
      `${v.name} ${v.brand}`.toLowerCase().includes(query.toLowerCase()),
  );
  const count = (status: WebStatus) =>
    items.filter((v) => v.status === status).length;
  return (
    <>
      <div className="web-page-heading">
        <div>
          <div className="web-breadcrumb">
            Website <span>/</span> Vehicles
          </div>
          <h1>
            Website fleet<span>.</span>
          </h1>
          <p>
            Choose what appears on your website. Your app fleet stays separate.
          </p>
        </div>
        <Button asChild>
          <Link href="/web/vehicles/new">
            <Plus size={16} />
            Add vehicle
          </Link>
        </Button>
      </div>
      <div className="web-summary">
        <span>
          <strong>{items.length.toString().padStart(2, "0")}</strong>vehicles
        </span>
        <span>
          <i className="web-dot published" />
          <strong>{count("published")}</strong>published
        </span>
        <span>
          <i className="web-dot draft" />
          <strong>{count("draft")}</strong>drafts
        </span>
        <a href={`${websiteBaseUrl}/fleet`} target="_blank" rel="noreferrer">
          View live fleet
          <ArrowUpRight size={14} />
        </a>
      </div>
      <div className="web-list-toolbar">
        <div
          className="web-filter-tabs"
          role="group"
          aria-label="Filter vehicles"
        >
          {["all", "published", "draft", "hidden", "archived"].map((status) => (
            <Button
              key={status}
              variant="ghost"
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
            >
              {status === "all"
                ? "All vehicles"
                : statusLabels[status as WebStatus]}
            </Button>
          ))}
        </div>
        <div className="web-search">
          <Search size={16} />
          <Input
            aria-label="Search vehicles"
            placeholder="Search vehicles…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh vehicles"
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </Button>
      </div>
      {error && (
        <div className="web-alert" role="alert">
          {error}
          <Button variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}
      {notice && (
        <div className="web-notice" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {loading ? (
        <div className="web-empty">
          <Loader2 className="web-spin" />
          <h2>Loading your fleet</h2>
        </div>
      ) : (
        <>
          <div className="web-list-labels">
            <span>VEHICLE</span>
            <span>PHOTOS</span>
            <span>STATUS</span>
            <span>LAST EDITED</span>
            <span />
          </div>
          <div className="web-vehicle-list">
            {visible.map((v) => {
              const cover =
                v.photos.find((p) => p.id === v.coverId) || v.photos[0];
              return (
                <article className="web-vehicle-row" key={v.id}>
                  <Link
                    className="web-vehicle-identity"
                    href={`/web/vehicles/${v.id}`}
                  >
                    <div className="web-row-photo">
                      {cover ? (
                        <img
                          src={photoUrl(cover)}
                          alt=""
                          style={{ objectPosition: `${cover.x}% ${cover.y}%` }}
                        />
                      ) : (
                        <CarFront size={23} />
                      )}
                    </div>
                    <div>
                      <h2>{v.name || "Untitled vehicle"}</h2>
                      <p>
                        {v.brand || "Brand not set"}
                        <span>·</span>
                        {v.category}
                      </p>
                      <small>/{v.slug}</small>
                    </div>
                  </Link>
                  <span className="web-row-photo-count">
                    <ImagePlus size={15} />
                    {v.photos.length}
                  </span>
                  <Badge variant="outline" className={`web-status ${v.status}`}>
                    {statusLabels[v.status]}
                    {v.status === "published" &&
                      v.publishedVersion !== v.version && (
                        <span
                          className="web-unsaved-dot"
                          title="Unpublished edits"
                        />
                      )}
                  </Badge>
                  <div className="web-row-date">
                    {new Date(v.updatedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    <small>
                      {v.status === "published" &&
                      v.publishedVersion !== v.version
                        ? "Unpublished edits"
                        : "Saved"}
                    </small>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    className="web-edit-vehicle"
                  >
                    <Link href={`/web/vehicles/${v.id}`}>
                      Edit vehicle
                      <ArrowUpRight size={14} />
                    </Link>
                  </Button>
                </article>
              );
            })}
          </div>
          {!visible.length && (
            <div className="web-empty">
              <CarFront size={30} />
              <h2>
                {items.length
                  ? "No matching vehicles"
                  : "Your website fleet starts here"}
              </h2>
              <p>
                {items.length
                  ? "Try another search or status."
                  : "Add a vehicle, upload its photos and publish when you’re ready."}
              </p>
              {!items.length && (
                <Button asChild>
                  <Link href="/web/vehicles/new">
                    Add your first vehicle
                    <Plus size={15} />
                  </Link>
                </Button>
              )}
            </div>
          )}
          <div className="web-list-footer">
            <span>
              {visible.length} of {items.length} vehicles
            </span>
            <span>Changes go live when you publish.</span>
          </div>
        </>
      )}
      <div className="web-import">
        <div>
          <strong>Already on the website?</strong>
          <p>
            Bring the existing listings in as drafts, then review before
            publishing.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await webRequest("import", { method: "POST" });
              await load();
              setNotice(
                "Existing listings imported as drafts. Published listings and your edits were kept.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <Loader2 size={15} className="web-spin" />
          ) : (
            <ImagePlus size={15} />
          )}
          Import existing fleet
        </Button>
      </div>
    </>
  );
}
