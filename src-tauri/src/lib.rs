use std::process::Command;

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

    let output = Command::new("osascript")
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

    let output = Command::new("osascript")
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
fn open_url(url: String) -> Result<(), String> {
    Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Failed to open URL: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
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
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
