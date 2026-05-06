use std::thread;
use tauri::Manager;
use tiny_http::{Header, Request, Response, Server};

#[tauri::command]
fn get_now_playing() -> Result<String, String> {
    let script = r#"
        set output to ""
        tell application "System Events"
            if exists process "Music" then
                tell application "Music"
                    if player state is playing then
                        set trackName to name of current track
                        set trackArtist to artist of current track
                        set output to trackName & " — " & trackArtist
                    end if
                end tell
            end if
        end tell
        if output is "" then
            tell application "System Events"
                if exists process "Spotify" then
                    tell application "Spotify"
                        if player state is playing then
                            set trackName to name of current track
                            set trackArtist to artist of current track
                            set output to trackName & " — " & trackArtist
                        end if
                    end tell
                end if
            end tell
        end if
        return output
    "#;

    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to execute osascript: {}", e))?;

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(result)
}

#[tauri::command]
fn get_next_calendar_event() -> Result<String, String> {
    let script = r#"
        tell application "Calendar"
            set now to current date
            set upcomingEvents to {}
            repeat with c in calendars
                set evs to (every event of c whose start date > now)
                repeat with e in evs
                    set end of upcomingEvents to e
                end repeat
            end repeat
            if (count of upcomingEvents) > 0 then
                set sortedEvents to my sortEvents(upcomingEvents)
                set nextEvent to item 1 of sortedEvents
                set eventTitle to summary of nextEvent
                set eventStart to start date of nextEvent
                set timeStr to time string of eventStart
                set dateStr to date string of eventStart
                set AppleScript's text item delimiters to ":"
                set timeParts to text items of timeStr
                if (count of timeParts) >= 2 then
                    set timeFormatted to item 1 of timeParts & ":" & item 2 of timeParts
                else
                    set timeFormatted to timeStr
                end if
                set AppleScript's text item delimiters to ""
                return eventTitle & " | " & dateStr & " " & timeFormatted
            else
                return ""
            end if
        end tell

        on sortEvents(evList)
            set sortedList to {}
            repeat with i from 1 to count of evList
                set minDate to start date of item 1 of evList
                set minIdx to 1
                repeat with j from 2 to count of evList
                    if start date of item j of evList < minDate then
                        set minDate to start date of item j of evList
                        set minIdx to j
                    end if
                end repeat
                set end of sortedList to item minIdx of evList
                set item minIdx of evList to missing value
            end repeat
            return sortedList
        end sortEvents
    "#;

    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to execute osascript: {}", e))?;

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        log::warn!("Calendar stderr: {}", stderr);
    }
    Ok(result)
}

#[tauri::command]
fn open_location_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices")
        .spawn()
        .map_err(|e| format!("Failed to open location settings: {}", e))?;
    Ok(())
}

#[cfg(not(debug_assertions))]
fn serve_file(dist_path: &std::path::Path, request: Request) {
    let url = request.url();
    let file_path = if url == "/" || url == "/index.html" {
        dist_path.join("index.html")
    } else {
        dist_path.join(url.trim_start_matches('/'))
    };

    // Security: prevent directory traversal
    let canonical_dist = match std::fs::canonicalize(dist_path) {
        Ok(p) => p,
        Err(_) => {
            let _ = request.respond(Response::from_string("Not Found").with_status_code(404));
            return;
        }
    };
    let canonical_file = match std::fs::canonicalize(&file_path) {
        Ok(p) => p,
        Err(_) => {
            let _ = request.respond(Response::from_string("Not Found").with_status_code(404));
            return;
        }
    };
    if !canonical_file.starts_with(&canonical_dist) {
        let _ = request.respond(Response::from_string("Forbidden").with_status_code(403));
        return;
    }

    match std::fs::read(&file_path) {
        Ok(contents) => {
            let content_type = match file_path.extension().and_then(|e| e.to_str()) {
                Some("html") => "text/html",
                Some("js") => "application/javascript",
                Some("mjs") => "application/javascript",
                Some("css") => "text/css",
                Some("svg") => "image/svg+xml",
                Some("png") => "image/png",
                Some("jpg") | Some("jpeg") => "image/jpeg",
                Some("ico") => "image/x-icon",
                Some("woff2") => "font/woff2",
                Some("woff") => "font/woff",
                Some("ttf") => "font/ttf",
                _ => "application/octet-stream",
            };

            let ct_header = Header::from_bytes(&b"Content-Type"[..], content_type.as_bytes()).unwrap();
            let csp = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; img-src 'self' https: data:; connect-src 'self' https: wss: https://*.open-meteo.com https://nominatim.openstreetmap.org; media-src https: blob:";
            let csp_header = Header::from_bytes(&b"Content-Security-Policy"[..], csp.as_bytes()).unwrap();

            let response = Response::from_data(contents)
                .with_header(ct_header)
                .with_header(csp_header);
            let _ = request.respond(response);
        }
        Err(_) => {
            let _ = request.respond(Response::from_string("Not Found").with_status_code(404));
        }
    }
}

#[cfg(not(debug_assertions))]
fn start_local_server(app_handle: &tauri::AppHandle) -> Result<u16, String> {
    let dist_path = app_handle
        .path()
        .resolve("dist", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve dist path: {}", e))?;

    log::info!("Serving frontend from: {:?}", dist_path);

    // Try a fixed port range first so the origin is stable across restarts.
    // localStorage is scoped to origin (scheme+host+port), so a random port
    // causes all persisted data to be lost on every app restart.
    let server = match (14200..=14210)
        .find_map(|port| Server::http(format!("127.0.0.1:{}", port)).ok())
    {
        Some(s) => s,
        None => Server::http("127.0.0.1:0")
            .map_err(|e| format!("Failed to start server: {}", e))?,
    };

    let port = server.server_addr().to_ip().unwrap().port();

    thread::spawn(move || {
        for request in server.incoming_requests() {
            serve_file(&dist_path, request);
        }
    });

    log::info!("Local server running on http://127.0.0.1:{}", port);
    Ok(port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                // Production: serve from localhost to fix YouTube embed origin (Error 153)
                match start_local_server(app.handle()) {
                    Ok(port) => {
                        if let Some(window) = app.get_webview_window("main") {
                            let url = format!("http://127.0.0.1:{}", port);
                            log::info!("Navigating window to {}", url);
                            let _ = window.navigate(url::Url::parse(&url).unwrap());
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to start local server: {}", e);
                    }
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_now_playing,
            get_next_calendar_event,
            open_location_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
