"use client";
/* eslint-disable @next/next/no-img-element -- Staff photos use authenticated media routes and editorial reference URLs. */
import Link from "next/link";
import { websiteBaseUrl } from "./site-url";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Check,
  GripVertical,
  ImagePlus,
  Loader2,
  Save,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/web-ui/button";
import { Input } from "@/components/web-ui/input";
import { Textarea } from "@/components/web-ui/textarea";
import { Badge } from "@/components/web-ui/badge";
import {
  blankVehicle,
  photoUrl,
  type WebAction,
  type WebPhoto,
  type WebVehicle,
  type WebVehicleContent,
} from "../model";
import { webRequest } from "./api";
import { statusLabels } from "./web-fleet";
export function WebVehicleEditor({ id }: { id?: string }) {
  const router = useRouter();
  const [record, setRecord] = useState<WebVehicle | null>(null);
  const [content, setContent] = useState<WebVehicleContent>({
    ...blankVehicle,
    photos: [],
  });
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<WebAction | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const draftId = useRef<string>("");
  const drag = useRef<number | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    webRequest<{ vehicle: WebVehicle }>(`vehicles/${id}`)
      .then(({ vehicle }) => {
        if (live) {
          setRecord(vehicle);
          setContent({ ...blankVehicle, ...vehicle });
          setLoading(false);
        }
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function edit<K extends keyof WebVehicleContent>(
    key: K,
    value: WebVehicleContent[K],
  ) {
    setContent((c) => ({ ...c, [key]: value }));
    setDirty(true);
    setNotice("");
  }
  function patchPhoto(photoId: string, patch: Partial<WebPhoto>) {
    edit(
      "photos",
      content.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)),
    );
  }
  function movePhoto(from: number, to: number) {
    if (to < 0 || to >= content.photos.length) return;
    const photos = [...content.photos];
    photos.splice(to, 0, photos.splice(from, 1)[0]);
    edit("photos", photos);
  }
  async function save(): Promise<WebVehicle> {
    if (!draftId.current) draftId.current = crypto.randomUUID();
    const response = await webRequest<{ vehicle: WebVehicle }>(
      record ? `vehicles/${record.id}` : "vehicles",
      {
        method: record ? "PUT" : "POST",
        body: JSON.stringify({
          id: draftId.current,
          expectedVersion: record?.version || 0,
          content,
        }),
      },
    );
    setRecord(response.vehicle);
    setContent(response.vehicle);
    setDirty(false);
    return response.vehicle;
  }
  async function perform(action: "save" | WebAction) {
    setBusy(action);
    setError("");
    setNotice("");
    setConfirm(null);
    try {
      let v = record;
      if (action === "delete" && v) {
        await webRequest(`vehicles/${v.id}/delete`, {
          method: "POST",
          body: JSON.stringify({ expectedVersion: v.version }),
        });
        setDirty(false);
        router.replace("/web");
        return;
      }

      if (action === "save" || action === "publish") {
        v = await save();
      }
      if (action !== "save" && v) {
        v = (
          await webRequest<{ vehicle: WebVehicle }>(
            `vehicles/${v.id}/${action}`,
            {
              method: "POST",
              body: JSON.stringify({ expectedVersion: v.version }),
            },
          )
        ).vehicle;
        setRecord(v);
        setContent(v);
        setDirty(false);
      }
      setNotice(
        action === "publish"
          ? "Published. The website will show this version on its next refresh."
          : action === "save"
            ? "Draft saved. Your live website has not changed."
            : action === "restore"
              ? "Restored as hidden. Review and publish when ready."
              : action === "archive"
                ? "Vehicle archived. It is no longer listed on the website."
                : "Vehicle hidden from the website.",
      );
      if (!id && v) router.replace(`/web/vehicles/${v.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    if (content.photos.length + files.length > 10) {
      setError("Use up to 10 photos per vehicle.");
      return;
    }
    setBusy("upload");
    setError("");
    const added: WebPhoto[] = [];
    try {
      for (const [index, file] of Array.from(files).entries()) {
        setUploadProgress(`Uploading ${index + 1} of ${files.length}…`);
        const form = new FormData();
        form.set("file", file);
        const { photo } = await webRequest<{ photo: WebPhoto }>("media", {
          method: "POST",
          body: form,
        });
        added.push({
          ...photo,
          alt: content.name ? `${content.name} photograph` : "",
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (added.length) {
        setContent((c) => ({
          ...c,
          photos: [...c.photos, ...added],
          coverId: c.coverId || added[0].id,
        }));
        setDirty(true);
      }
      setBusy("");
      setUploadProgress("");
      if (upload.current) upload.current.value = "";
    }
  }
  const selected = content.photos.find((p) => p.id === activePhoto);
  const archived = record?.status === "archived";
  if (loading)
    return (
      <div className="web-empty">
        <Loader2 className="web-spin" />
        Loading vehicle…
      </div>
    );
  if (id && !record)
    return (
      <div className="web-empty">
        <h1>Vehicle unavailable</h1>
        <p role="alert">{error}</p>
        <Link href="/web">Back to fleet</Link>
      </div>
    );
  return (
    <>
      <Link href="/web" className="web-back">
        <ArrowLeft size={14} />
        Website fleet
      </Link>
      <div className="web-page-heading web-editor-heading">
        <div>
          <div className="web-editor-title">
            <h1>
              {record ? record.name || "Untitled vehicle" : "Add a vehicle"}
              <span>.</span>
            </h1>
            <Badge
              variant="outline"
              className={`web-status ${record?.status || "draft"}`}
            >
              {statusLabels[record?.status || "draft"]}
            </Badge>
          </div>
          <p>
            {dirty
              ? "You have unsaved changes."
              : record
                ? "Your saved website listing."
                : "Start with the details. Publish when everything is ready."}
          </p>
        </div>
        <div className="web-editor-actions">
          {!archived && (
            <>
              <Button
                variant="outline"
                disabled={Boolean(busy)}
                onClick={() => void perform("save")}
              >
                {busy === "save" ? (
                  <Loader2 className="web-spin" />
                ) : (
                  <Save size={15} />
                )}
                Save draft
              </Button>
              <Button
                disabled={Boolean(busy)}
                onClick={() => void perform("publish")}
              >
                {busy === "publish" ? (
                  <Loader2 className="web-spin" />
                ) : (
                  <ArrowUpRight size={16} />
                )}
                Publish vehicle
              </Button>
            </>
          )}
          {archived && (
            <Button
              disabled={Boolean(busy)}
              onClick={() => void perform("restore")}
            >
              Restore vehicle
            </Button>
          )}
        </div>
      </div>
      {error && (
        <div className="web-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="web-notice" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {record?.status === "published" && (
        <div className="web-publish-note">
          <span className="web-dot published" />
          <span>
            {record.publishedVersion !== record.version
              ? "You have saved edits that are not published."
              : "This vehicle is published on your website."}
          </span>
          <a
            href={`${websiteBaseUrl}/fleet/${record.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            View live
            <ArrowUpRight size={13} />
          </a>
        </div>
      )}
      <fieldset
        className="web-editor-grid"
        disabled={Boolean(busy) || archived}
      >
        <section className="web-editor-details">
          <div className="web-section-title">
            <h2>Vehicle details</h2>
            <span>01</span>
          </div>
          <div className="web-fields">
            <label>
              Vehicle name
              <Input
                value={content.name}
                maxLength={100}
                placeholder="e.g. Toyota Land Cruiser Prado"
                onChange={(e) => edit("name", e.target.value)}
              />
            </label>
            <div className="web-field-pair">
              <label>
                Brand
                <Input
                  value={content.brand}
                  maxLength={60}
                  placeholder="Toyota"
                  onChange={(e) => edit("brand", e.target.value)}
                />
              </label>
              <label>
                <span>
                  Model year <small>optional</small>
                </span>
                <Input
                  value={content.year}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="YYYY"
                  onChange={(e) =>
                    edit("year", e.target.value.replace(/\D/g, ""))
                  }
                />
              </label>
            </div>
            <label>
              Category
              <Input
                list="web-vehicle-categories"
                value={content.category}
                maxLength={60}
                onChange={(e) => edit("category", e.target.value)}
              />
              <datalist id="web-vehicle-categories">
                <option>Executive SUV</option>
                <option>Luxury SUV</option>
                <option>Executive saloon</option>
                <option>Signature SUV</option>
              </datalist>
            </label>
            <label>
              Short description
              <Textarea
                rows={2}
                maxLength={160}
                value={content.tagline}
                placeholder="A short line for the fleet card."
                onChange={(e) => edit("tagline", e.target.value)}
              />
              <small>{content.tagline.length} / 160</small>
            </label>
            <label>
              About this vehicle
              <Textarea
                rows={5}
                maxLength={2500}
                value={content.description}
                placeholder="Help your guest choose the right ride."
                onChange={(e) => edit("description", e.target.value)}
              />
            </label>
            <div className="web-field-pair">
              <label>
                Passenger information
                <Input
                  value={content.passengers}
                  maxLength={100}
                  placeholder="Confirmed for your group"
                  onChange={(e) => edit("passengers", e.target.value)}
                />
              </label>
              <label>
                Display order
                <Input
                  type="number"
                  min={0}
                  max={9999}
                  value={content.order}
                  onChange={(e) => edit("order", Number(e.target.value))}
                />
                <small>Lower numbers appear first.</small>
              </label>
            </div>
            <label>
              Best suited to
              <Input
                value={content.bestSuited || ""}
                maxLength={200}
                placeholder="Airport · Business · Road journeys"
                onChange={(e) => edit("bestSuited", e.target.value)}
              />
            </label>
            <label>
              Chauffeur information
              <Input
                value={content.chauffeur}
                maxLength={200}
                onChange={(e) => edit("chauffeur", e.target.value)}
              />
            </label>
          </div>
        </section>
        <section className="web-editor-photos">
          <div className="web-section-title">
            <h2>
              Photographs<span>{content.photos.length} / 10</span>
            </h2>
            <span>02</span>
          </div>
          <p className="web-section-description">
            Choose a cover. Arrange the rest in the order guests will see them.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            ref={upload}
            hidden
            onChange={(e) => void addPhotos(e.target.files)}
          />
          <button
            type="button"
            className="web-upload-zone"
            onClick={() => upload.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy && !archived) void addPhotos(e.dataTransfer.files);
            }}
          >
            <UploadCloud size={24} />
            <strong>{uploadProgress || "Drop photos here, or browse"}</strong>
            <span>JPEG, PNG or WebP · up to 10 MB each</span>
          </button>
          <div className="web-photo-grid">
            {content.photos.map((photo, index) => (
              <article
                key={photo.id}
                className={`web-photo-tile ${content.coverId === photo.id ? "is-cover" : ""}`}
                draggable={!busy && !archived}
                onDragStart={() => {
                  drag.current = index;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag.current !== null) movePhoto(drag.current, index);
                  drag.current = null;
                }}
              >
                <button
                  type="button"
                  className="web-photo-image"
                  aria-label={`Edit photo ${index + 1}`}
                  onClick={() => setActivePhoto(photo.id)}
                >
                  <img
                    src={photoUrl(photo)}
                    alt={photo.alt || `Vehicle photo ${index + 1}`}
                    style={{ objectPosition: `${photo.x}% ${photo.y}%` }}
                  />
                  {content.coverId === photo.id && (
                    <span className="web-cover-label">
                      <Star size={12} />
                      Cover
                    </span>
                  )}
                  <span className="web-photo-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </button>
                <div className="web-photo-toolbar">
                  <GripVertical size={14} />
                  <button
                    type="button"
                    onClick={() => edit("coverId", photo.id)}
                    aria-label={`Set photo ${index + 1} as cover`}
                    aria-pressed={content.coverId === photo.id}
                  >
                    <Star size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move photo ${index + 1} earlier`}
                    disabled={index === 0}
                    onClick={() => movePhoto(index, index - 1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move photo ${index + 1} later`}
                    disabled={index === content.photos.length - 1}
                    onClick={() => movePhoto(index, index + 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove photo ${index + 1}`}
                    onClick={() => {
                      edit(
                        "photos",
                        content.photos.filter((p) => p.id !== photo.id),
                      );
                      if (content.coverId === photo.id)
                        setContent((c) => ({
                          ...c,
                          coverId: c.photos[0]?.id || "",
                        }));
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <button
                  type="button"
                  className="web-photo-edit"
                  onClick={() => setActivePhoto(photo.id)}
                >
                  Edit photo details
                  <ArrowUpRight size={12} />
                </button>
              </article>
            ))}
          </div>
          {!content.photos.length && (
            <div className="web-photo-help">
              <ImagePlus size={17} />
              <p>
                Add your actual vehicle photos. The first becomes the cover; you
                can change it at any time.
              </p>
            </div>
          )}
          {selected && (
            <div className="web-photo-properties">
              <div className="web-section-title">
                <h3>
                  Photo{" "}
                  {content.photos.findIndex((p) => p.id === selected.id) + 1}
                </h3>
                <button type="button" onClick={() => setActivePhoto(null)}>
                  Done
                  <Check size={14} />
                </button>
              </div>
              <label>
                Photo description
                <Input
                  value={selected.alt}
                  maxLength={200}
                  onChange={(e) =>
                    patchPhoto(selected.id, { alt: e.target.value })
                  }
                />
              </label>
              <label>
                Caption
                <Textarea
                  rows={2}
                  value={selected.caption}
                  maxLength={300}
                  onChange={(e) =>
                    patchPhoto(selected.id, { caption: e.target.value })
                  }
                />
              </label>
              <label>
                Photo type
                <select
                  value={selected.kind}
                  onChange={(e) =>
                    patchPhoto(selected.id, {
                      kind: e.target.value as WebPhoto["kind"],
                    })
                  }
                >
                  <option value="actual">Actual vehicle</option>
                  <option value="reference">Reference photograph</option>
                  <option value="illustration">Illustration</option>
                </select>
              </label>
              <label>
                Horizontal focal point <span>{selected.x}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={selected.x}
                  onChange={(e) =>
                    patchPhoto(selected.id, { x: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Vertical focal point <span>{selected.y}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={selected.y}
                  onChange={(e) =>
                    patchPhoto(selected.id, { y: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          )}
        </section>
      </fieldset>
      {record && (
        <div className="web-editor-lifecycle">
          <p>Keep this listing for later, without showing it on the website.</p>
          <div>
            {record.status === "published" && (
              <Button
                variant="outline"
                disabled={Boolean(busy) || dirty}
                onClick={() => setConfirm("hide")}
              >
                Hide vehicle
              </Button>
            )}
            {!archived && (
              <Button
                variant="ghost"
                disabled={Boolean(busy) || dirty}
                onClick={() => setConfirm("archive")}
              >
                Archive vehicle
              </Button>
            )}
            <Button
              variant="destructive"
              disabled={Boolean(busy) || dirty}
              onClick={() => setConfirm("delete")}
            >
              Delete vehicle
            </Button>
          </div>
        </div>
      )}
      {confirm && (
        <div
          className="web-confirm"
          role="region"
          aria-labelledby="web-confirm-title"
        >
          <div>
            <h2 id="web-confirm-title">
              {confirm === "delete"
                ? "Delete"
                : confirm === "archive"
                  ? "Archive"
                  : "Hide"}{" "}
              this vehicle?
            </h2>
            <p>
              {confirm === "delete"
                ? "This permanently deletes the listing and removes it from the website and booking choices. This cannot be undone."
                : "It will no longer appear on the website or in new booking options. You can bring it back later."}
            </p>
            <div>
              <Button
                variant="outline"
                autoFocus
                onClick={() => setConfirm(null)}
              >
                Keep vehicle
              </Button>
              <Button onClick={() => void perform(confirm)}>
                {confirm === "delete"
                  ? "Delete"
                  : confirm === "archive"
                    ? "Archive"
                    : "Hide"}{" "}
                vehicle
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
