import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

interface OverrideEntry {
  appName: string;
  featureKey: string;
  url: string;
}

interface Profile {
  name: string;
  overrides: OverrideEntry[];
}

const STORAGE_KEY = "profiles";
const DEFAULT_FEATURE_KEY = "bootstrap/js";
const COOKIE_CLEAR_DELAY = 100;

export const Popup = () => {
  const [profileName, setProfileName] = useState("");
  const [entries, setEntries] = useState<OverrideEntry[]>([]);
  const [savedProfiles, setSavedProfiles] = useState<Profile[]>([]);
  const [activeProfiles, setActiveProfiles] = useState<string[]>([]);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load profiles from storage
  useEffect(() => {
    chrome.storage.sync.get(STORAGE_KEY, (data) => {
      setSavedProfiles(data[STORAGE_KEY] ?? []);
    });
  }, []);

  useEffect(() => {
    if (editingProfile) {
      setProfileName(editingProfile.name);
      setEntries([...editingProfile.overrides]);
    }
  }, [editingProfile]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const showError = (message: string) => {
    setError(message);
    console.error(`[Popup] ${message}`);
  };

  const resetForm = () => {
    setProfileName("");
    setEntries([]);
    setEditingProfile(null);
    setError(null);
  };

  const clearAllOverrideCookies = (): Promise<void> => {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id || !tab.url) {
          resolve();
          return;
        }

        const url = new URL(tab.url);

        chrome.cookies.getAll({ domain: url.hostname }, (cookies) => {
          const overrideCookies = cookies.filter((cookie) =>
            cookie.name.includes("/"),
          );

          if (overrideCookies.length === 0) {
            resolve();
            return;
          }

          let removedCount = 0;
          const totalToRemove = overrideCookies.length;

          overrideCookies.forEach((cookie) => {
            chrome.cookies.remove(
              {
                url: `${url.protocol}//${cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain}${cookie.path}`,
                name: cookie.name,
              },
              () => {
                removedCount++;
                if (removedCount === totalToRemove) {
                  resolve();
                }
              },
            );
          });
        });
      });
    });
  };

  const applyOverlay = async (profile: Profile) => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      await clearAllOverrideCookies();

      const cookieArray = profile.overrides.map(
        (o) => `${o.appName}/${o.featureKey}=${encodeURIComponent(o.url)}`,
      );

      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id !== undefined) {
          chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            css: `
            iframe#override_profile {
              all: unset;
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              border: none;
              margin: 0;
              padding: 0;
              z-index: 9999;
              display: block;
            }

            #overlay_controls {
              position: fixed;
              bottom: 10px;
              right: 10px;
              z-index: 9999;
              background: white;
              padding: 8px 12px;
              border: 1px solid #ccc;
              border-radius: 6px;
              box-shadow: 0 0 8px rgba(0, 0, 0, 0.1);
              font-family: sans-serif;
            }

            #overlay_controls label {
              font-size: 12px;
              display: block;
              margin-bottom: 4px;
            }

            #overlay_controls input[type="range"] {
              width: 150px;
            }
          `,
          });
          chrome.scripting
            .executeScript({
              target: { tabId: tab.id },
              func: (cookieArr: string[]) => {
                localStorage.removeItem("__disable_js_overrides__");

                cookieArr.forEach((value) => {
                  document.cookie = value;
                });

                const iframe = document.createElement("iframe");

                iframe.src = window.location.href;
                iframe.id = "override_profile";

                const controls = document.createElement("div");
                controls.id = "overlay_controls";
                controls.innerHTML = `
                  <div id="overlay_controls">
                    <label for="overlay_slider">Overlay Opacity</label>
                    <input type="range" id="overlay_slider" min="0" max="1" step="0.01" value="1">
                    <label style="display:block; margin-top:8px;">
                    <input type="checkbox" id="overlay_toggle" >
                    compare
                  </label>
                  </div>`;
                document.body.appendChild(iframe);
                document.body.appendChild(controls);

                const onBlendModeToggle = (event: any) => {
                  const iframe = document.getElementById("override_profile");
                  if (iframe) {
                    const iframe = document.getElementById("override_profile");
                    if (iframe) {
                      iframe.style.mixBlendMode = event.currentTarget.checked
                        ? "difference"
                        : "unset";
                    }
                  }
                };

                const handleOpacityChange = (event: any) => {
                  const iframe = document.getElementById("override_profile");
                  if (iframe) {
                    iframe.style.opacity = event.target.value;
                  }
                };

                document
                  .getElementById("overlay_slider")
                  ?.addEventListener("input", handleOpacityChange);
                document
                  .getElementById("overlay_toggle")
                  ?.addEventListener("change", onBlendModeToggle);
              },
              args: [cookieArray],
            })
            .then(() => {
              setActiveProfiles((prev) =>
                prev.includes(profile.name) ? prev : [...prev, profile.name],
              );
            })
            .catch(console.error);
        }
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to apply profile");
    } finally {
      setIsLoading(false);
    }
  };

  // Entry
  const updateEntry = (
    index: number,
    field: keyof OverrideEntry,
    value: string,
  ) => {
    setEntries((prev) => {
      const updated = [...prev];
      updated[index][field] = value;
      return updated;
    });
  };

  const addEntry = () => {
    setEntries((prev) => [
      ...prev,
      { appName: "", featureKey: DEFAULT_FEATURE_KEY, url: "" },
    ]);
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  // Profile
  const saveProfile = async () => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    if (!profileName || entries.length === 0) return;
    try {
      const trimmedProfileName = profileName.trim();
      const isEditing = editingProfile !== null;
      const existingProfile = savedProfiles.find(
        (p) => p.name === trimmedProfileName,
      );

      if (!isEditing && existingProfile) {
        alert("A profile with this name already exists.");
        return;
      }

      const updatedProfile: Profile = {
        name: trimmedProfileName,
        overrides: entries,
      };

      const updatedProfiles = isEditing
        ? savedProfiles.map((p) =>
            p.name === editingProfile!.name ? updatedProfile : p,
          )
        : [...savedProfiles, updatedProfile];

      if (isEditing && activeProfiles.includes(trimmedProfileName)) {
        await disableProfile(editingProfile!);
      }

      chrome.storage.sync.set({ profiles: updatedProfiles }, () => {
        setSavedProfiles(updatedProfiles);
        setProfileName("");
        setEntries([]);
        setEditingProfile(null);

        if (isEditing && activeProfiles.includes(trimmedProfileName)) {
          setTimeout(() => {
            applyProfile(updatedProfile);
          }, COOKIE_CLEAR_DELAY);
        }
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setIsLoading(false);
    }
  };

  const applyProfile = async (profile: Profile) => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      await clearAllOverrideCookies();

      const cookieArray = profile.overrides.map(
        (o) => `${o.appName}/${o.featureKey}=${encodeURIComponent(o.url)}`,
      );

      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id !== undefined) {
          chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            css: `
            iframe#override_profile {
              all: unset;
              position: fixed;
              top: 0;
              left: 0;
              width: 50vw;
              height: 100vh;
              border: none;
              margin: 0;
              padding: 0;
              z-index: 9999;
              display: block;
            }

          `,
          });
          chrome.scripting
            .executeScript({
              target: { tabId: tab.id },
              func: (cookieArr: string[]) => {
                localStorage.removeItem("__disable_js_overrides__");

                cookieArr.forEach((value) => {
                  document.cookie = value;
                });
              },
              args: [cookieArray],
            })
            .then(() => {
              setActiveProfiles((prev) =>
                prev.includes(profile.name) ? prev : [...prev, profile.name],
              );
              if (tab.id !== undefined) {
                chrome.tabs.reload(tab.id);
              }
            })
            .catch(console.error);
        }
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to apply profile");
    } finally {
      setIsLoading(false);
    }
  };

  const disableProfile = (profile: Profile): Promise<void> => {
    if (isLoading) return Promise.resolve();

    setIsLoading(true);
    setError(null);

    try {
      const cookieKeys = profile.overrides.map(
        (o) => `${o.appName}/${o.featureKey}`,
      );

      return new Promise((resolve, reject) => {
        chrome.tabs.query(
          { active: true, currentWindow: true },
          async ([tab]) => {
            if (!tab?.id || !tab.url) {
              resolve();
              return;
            }

            const url = new URL(tab.url);

            await Promise.all(
              cookieKeys.map(
                (key) =>
                  new Promise<void>((res) => {
                    chrome.cookies.getAll(
                      { domain: url.hostname, name: key },
                      (cookies) => {
                        if (!cookies.length) return res();
                        let removedCount = 0;
                        cookies.forEach((cookie) => {
                          chrome.cookies.remove(
                            {
                              url: `${url.protocol}//${cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain}${cookie.path}`,
                              name: cookie.name,
                            },
                            () => {
                              removedCount++;
                              if (removedCount === cookies.length) res();
                            },
                          );
                        });
                      },
                    );
                  }),
              ),
            );

            chrome.scripting
              .executeScript({
                target: { tabId: tab.id },
                func: (keys: string[]) => {
                  localStorage.setItem("__disable_js_overrides__", "true");
                  keys.forEach((key) => {
                    const script = document.getElementById(
                      `override-script-${key}`,
                    );
                    if (script) {
                      script.remove();
                      console.log(`Removed script tag for: ${key}`);
                    }
                  });
                },
                args: [cookieKeys],
              })
              .then(() => {
                setActiveProfiles((prev) =>
                  prev.filter((name) => name !== profile.name),
                );
                chrome.tabs.reload(tab.id!, { bypassCache: true });
                resolve();
              })
              .catch(reject);
          },
        );
      });
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to disable profile",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const deleteProfile = (name: string) => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const updated = savedProfiles.filter((p) => p.name !== name);
      chrome.storage.sync.set({ profiles: updated }, () => {
        setSavedProfiles(updated);
        setActiveProfiles((prev) => prev.filter((n) => n !== name));
      });
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to delete profile",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const canSaveProfile =
    profileName.trim() &&
    entries.some(
      (e) => e.appName.trim() && e.featureKey.trim() && e.url.trim(),
    );

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "sans-serif",
        width: 600,
        minHeight: 300,
      }}
    >
      {error && (
        <div
          style={{
            padding: 8,
            marginBottom: 12,
            backgroundColor: "#fee",
            border: "1px solid #fcc",
            borderRadius: 4,
            color: "#c33",
            fontSize: "0.9em",
          }}
        >
          {error}
        </div>
      )}

      <h3 style={{ margin: "0 0 16px 0" }}>
        {editingProfile ? "Edit Profile" : "Create Profile"}
      </h3>

      <input
        placeholder="Profile name"
        value={profileName}
        onChange={(e) => setProfileName(e.target.value)}
        style={{
          width: 275,
          marginBottom: 12,
          padding: 8,
          border: "1px solid #ccc",
          borderRadius: 4,
          fontSize: "14px",
        }}
        disabled={isLoading}
      />

      <div style={{ marginBottom: 12 }}>
        {entries.map((entry, i) => (
          <div
            key={i}
            style={{
              marginBottom: 8,
              display: "flex",
              gap: 4,
              alignItems: "center",
            }}
          >
            <input
              placeholder="App name"
              value={entry.appName}
              onChange={(e) => updateEntry(i, "appName", e.target.value)}
              style={{
                width: "25%",
                padding: 6,
                border: "1px solid #ccc",
                borderRadius: 3,
                fontSize: "12px",
              }}
              disabled={isLoading}
            />
            <input
              placeholder="Feature key"
              value={entry.featureKey}
              onChange={(e) => updateEntry(i, "featureKey", e.target.value)}
              style={{
                width: "25%",
                padding: 6,
                border: "1px solid #ccc",
                borderRadius: 3,
                fontSize: "12px",
              }}
              disabled={isLoading}
            />
            <input
              placeholder="URL"
              value={entry.url}
              onChange={(e) => updateEntry(i, "url", e.target.value)}
              style={{
                width: "40%",
                padding: 6,
                border: "1px solid #ccc",
                borderRadius: 3,
                fontSize: "12px",
              }}
              disabled={isLoading}
            />
            <button
              onClick={() => removeEntry(i)}
              style={{
                background: "transparent",
                border: "none",
                color: "#c33",
                fontWeight: "bold",
                cursor: isLoading ? "not-allowed" : "pointer",
                fontSize: "16px",
                padding: 4,
                minWidth: 24,
                opacity: isLoading ? 0.5 : 1,
              }}
              title="Remove entry"
              disabled={isLoading}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={addEntry}
          style={{
            marginRight: 8,
            padding: "8px 12px",
            backgroundColor: "#f0f0f0",
            border: "1px solid #ccc",
            borderRadius: 4,
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.5 : 1,
          }}
          disabled={isLoading}
        >
          + Add Entry
        </button>
        <button
          onClick={saveProfile}
          style={{
            marginRight: 8,
            padding: "8px 12px",
            backgroundColor: canSaveProfile && !isLoading ? "#007cba" : "#ccc",
            color: canSaveProfile && !isLoading ? "white" : "#666",
            border: "none",
            borderRadius: 4,
            cursor: canSaveProfile && !isLoading ? "pointer" : "not-allowed",
          }}
          disabled={!canSaveProfile || isLoading}
        >
          {isLoading ? "Saving..." : "Save Profile"}
        </button>
        {editingProfile && (
          <button
            onClick={resetForm}
            style={{
              padding: "8px 12px",
              backgroundColor: "#f0f0f0",
              border: "1px solid #ccc",
              borderRadius: 4,
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.5 : 1,
            }}
            disabled={isLoading}
          >
            Cancel
          </button>
        )}
      </div>

      <hr
        style={{
          margin: "16px 0",
          border: "none",
          borderTop: "1px solid #eee",
        }}
      />

      <h4 style={{ margin: "0 0 12px 0" }}>
        Saved Profiles ({savedProfiles.length})
      </h4>

      {savedProfiles.length === 0 ? (
        <div style={{ color: "#666", fontStyle: "italic" }}>
          No saved profiles yet.
        </div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {savedProfiles.map((profile) => {
            const isActive = activeProfiles.includes(profile.name);
            return (
              <div
                key={profile.name}
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 6,
                  backgroundColor: isActive ? "#e8f4f8" : "#f9f9f9",
                  border: isActive ? "2px solid #007cba" : "1px solid #e0e0e0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <strong style={{ flex: 1 }}>{profile.name}</strong>
                  {isActive && (
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#007cba",
                        fontWeight: "bold",
                        padding: "2px 6px",
                        backgroundColor: "white",
                        borderRadius: 10,
                      }}
                    >
                      ACTIVE
                    </span>
                  )}
                </div>

                <div
                  style={{ fontSize: "12px", margin: "8px 0", color: "#555" }}
                >
                  {profile.overrides.map((o, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <code
                        style={{
                          backgroundColor: "#f0f0f0",
                          padding: "2px 4px",
                          borderRadius: 2,
                          fontSize: "11px",
                        }}
                      >
                        {o.appName}/{o.featureKey}
                      </code>
                      {" → "}
                      <span
                        style={{ wordBreak: "break-word", fontSize: "11px" }}
                      >
                        {o.url}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => applyProfile(profile)}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#007cba",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: isLoading ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      opacity: isLoading ? 0.5 : 1,
                    }}
                    disabled={isLoading}
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => applyOverlay(profile)}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#007cba",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: isLoading ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      opacity: isLoading ? 0.5 : 1,
                    }}
                  >
                    Overlay
                  </button>
                  <button
                    onClick={() => setEditingProfile(profile)}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#f0f0f0",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      cursor: isLoading ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      opacity: isLoading ? 0.5 : 1,
                    }}
                    disabled={isLoading}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => disableProfile(profile)}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#f0f0f0",
                      color: "#666",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      cursor: isLoading ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      opacity: isLoading ? 0.5 : 1,
                    }}
                    disabled={isLoading}
                  >
                    Disable
                  </button>
                  <button
                    onClick={() => deleteProfile(profile.name)}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#fee",
                      color: "#c33",
                      border: "1px solid #fcc",
                      borderRadius: 4,
                      cursor: isLoading ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      opacity: isLoading ? 0.5 : 1,
                    }}
                    disabled={isLoading}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Popup />);
