// Copyright 2023 Google LLC
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     https://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// lrtile: move/resize window on a grid using Alt/Shift + arrows
//
// Alt+Arrows move the current window, Shft+Arrows resize it
//
// To install, copy to ~/.local/share/cinnamon/extensions/lrtile@lrizzo/
// and enable from Menu->Preferences->Extensions.

//--- porting to gnome-shell 45, imports at the top
//const Main = imports.ui.main;
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/*

- on gnome 45 the language has changed

 https://gjs.guide/extensions/upgrading/gnome-shell-45.html#prefs-js

- alt-f2 r does not work anymore https://superuser.com/questions/1164174/how-can-i-restart-the-gnome-shell-on-wayland

- gnome-shell-extension-tool -r lrtile-gnome@lrizzo.it does not work anymore
- dbus-run-session -- gnome-shell -nested --wayland

 */

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

//const Gio = imports.gi.Gio;
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';			// Flags values
import Shell from 'gi://Shell';
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/util.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/main.js';
import GObject from 'gi://GObject';
import St from 'gi://St';

let lrOptions = { uuid: "", rows: 12, cols: 14, border: 2, step: 2, logLevel: 0 };

// Log output in ~/.xsession-errors (used to be in ~/.cinnamon/glass.log )

// printf-like logging, no deep object print
function L(level, ...args) {
    if (level <= lrOptions.logLevel) {
        log(PF(...args));
    }
}

function PF() {  // simplified printf
    let n = arguments.length, res = arguments[0];
    for (let i = 1; i < n; i++) {
        res = res.replace(/%[dus]/, arguments[i]);
    }
    return res;
}

/* Object print */
function PO(o, maxdepth) { return _PO(o, 0, maxdepth, new Map()); }

function _PO(o, depth, maxdepth, seen) {
    maxdepth = maxdepth || 6;
    seen = seen || new Map();
    if (depth > maxdepth) return "...";
    let t = typeof(o);
    switch (t) {
    default:
        L(0, "type of %s is %s", o, t);
    case 'function':
    case 'string':
	return ('"' + o + '"').replace(/\n/g, " ");

    case 'boolean':
    case 'number':
    case 'undefined':
	return o;

    case 'object':
	if (o === null) return "null";
	if (seen.get(o)) return "{" + o + " (recursive)}";
	seen.set(o, true);
	let res = new Array();
	for (let i in o) {
	    res.push("" + i + " : " + _PO(o[i], depth + 1, maxdepth, seen));
	}
	let indent = "    ".repeat(depth), sep = ",\n" + indent
	return "{\n" + indent + res.join(sep) + '}';
    }
}

function getDisplayArea(win) {
    const monitor = win.get_work_area_current_monitor();
    return [monitor.x, monitor.y, monitor.width, monitor.height];
}

// Handler for the various commands.
function doCmd(cmd) {
    let window = global.display.focus_window;
    if (!window) return L(0, "no window, nothing to do");
    let win = window.get_frame_rect();	// XXX get_outer_rect() in cinnamon
    let [wX, wY, wW, wH] = [win.x, win.y, win.width, win.height];

    const [mX, mY, mW, mH] = getDisplayArea(window);
    L(2, "CMD %s window %dx%d@%d,%d monitor %dx%d@%d,%d", cmd, wW, wH, wX, wY, mX, mY, mW, mH);

    let rows = Math.max(lrOptions.rows, 4);
    let cols = Math.max(lrOptions.cols, 4);
    const [minW, minH] = [lrOptions.step, lrOptions.step];
    const [dX, dY] = [Math.floor(mW / cols), Math.floor(mH / rows)];

    // x0,y0 x1,y1 are window coordinates in grid units relative to the display.
    let x0 = Math.round((wX - mX) / dX), y0 = Math.round((wY - mY) / dY);
    let x1 = Math.round((wX + wW - mX) / dX), y1 = Math.round((wY + wH - mY) / dY);
    // Enforce min size.
    if (x1 - x0 < minW) x1 = Math.min(cols, x0 + minW); // first, expand right
    if (x1 - x0 < minW) x0 = Math.max(0, x1 - minW); // then expand left.
    if (x1 - x0 < minW) return L(0, "screen too narrow!");

    if (y1 - y0 < minH) y1 = Math.min(rows, y0 + minH); // first, expand low
    if (y1 - y0 < minH) y0 = Math.max(0, y1 - minH); // then expand top.
    if (y1 - y0 < minH) return L(0, "screen too short!");

    const o_x0 = x0, o_x1 = x1, o_y0 = y0, o_y1 = y1; // save old position.

    L(0, "  before: %d,%d %d,%d  absolute %d,%d %d,%d",
      x0, y0, x1, y1, mX + x0 * dX, mY + y0 * dY, mX + x1 * dX, mY + y1 * dY);
    // Processing: change x0 x1 y0 y1 as fit.
    switch (cmd) {
    default:
	L(0, "unrecognized command %s", cmd);
	break;

    case 'lr-full':
	x0 = 0; y0 = 0; x1 = cols; y1 = rows;
	break;

    case 'lr-wide':
	if (x1 < cols) x1++;
	else if (x0 > 0) x0--;
	break;

    case 'lr-narrow':
	if (x1 - x0 > minW) x1--;
	break;

    case 'lr-tall':
	if (y1 < rows) y1++;
	else if (y0 > 0) y0--;
	break;

    case 'lr-short':
	if (y1 - y0 > minH) y1--;
	break;

    case 'lr-left':
	if (x0 > 0) { x0--; x1--; }
	else if (x1 - x0 > minW) x1--;
	break;

    case 'lr-right':
	if (x1 < cols) { x0++; x1++; }
	else if (x0 < cols - minW && x1 - x0 > minW) x0++;
	break;

    case 'lr-down':
	if (y1 < rows) { y0++; y1++; }
	else if (y0 < rows - minH && y1 - y0 > minH) y0++;
	break;

    case 'lr-up':
	if (y0 > 0) { y0--; y1--; }
	else if (y1 - y0 > minH) y1--;
	break;
    }

    L(0, "  after:  %d,%d %d,%d  absolute %d,%d %d,%d",
      x0, y0, x1, y1, mX + x0 * dX, mY + y0 * dY, mX + x1 * dX, mY + y1 * dY);

    if (x0 == o_x0 && x1 == o_x1 && y0 == o_y0 && y1 == o_y1) return;
    // Compute new position
    wX = mX + x0 * dX;
    wW = (x1 - x0) * dX - lrOptions.border;
    wY = mY + y0 * dY;
    wH = (y1 - y0) * dY - lrOptions.border;

    const is_max = window.get_maximized();	/* 0, 1, 2, 3 */
    if (is_max) window.unmaximize(is_max);
    window.unmake_fullscreen();
    window.move_frame(true, wX, wY);
    window.move_resize_frame(true, wX, wY, wW, wH);

    window.move_resize_frame(true, wX, wY, wW, wH);
    // If focus-follows-pointer, move may cause a focus change on return. To
    // prevent that, set the focus mode to 'click', or find a way to move the
    // the mouse on the window. Setting the focus as below does not help.
    // global.display.set_input_focus_window(window,
    //	 false, global.get_current_time());
}


// Default key configuration.
const LRMOVE = "<Alt>", LRSIZE = "<Shift>";	// Modifiers
const LRKEY = {
	"lr-narrow" : LRSIZE + "Left",
	"lr-wide" :   LRSIZE + "Right",
	"lr-short" :  LRSIZE + "Up",
	"lr-tall" :   LRSIZE + "Down",
	"lr-left" :   LRMOVE + "Left",
	"lr-right" :  LRMOVE + "Right",
	"lr-up" :     LRMOVE + "Up",
	"lr-down" :   LRMOVE + "Down",
	"lr-full" :   LRMOVE + "F",
    };

// create settings and compile with glib-compile-schemas schemas/
//const Gio = imports.gi.Gio;
function getSettings(t) {
    let GioSSS = Gio.SettingsSchemaSource;
    let schemaSource = GioSSS.new_from_directory(t.dir.get_child("schemas").get_path(), GioSSS.get_default(), false);
    let schemaObj = schemaSource.lookup('org.gnome.shell.extensions.lrtile', true);
    if (!schemaObj) { throw new Error('cannot find schemas'); }
    L(0, "------------- schema is %s", PO(schemaObj, 3));
    L(2, "schema keys are %s", PO(schemaObj.list_keys(), 3));
    return new Gio.Settings({ settings_schema : schemaObj });
}

function disableKeys(t) {
    const settings = getSettings(t);
    settings.settings_schema.list_keys().forEach( (k) => {
        L(0, "disable shortcut %s", k);
        Main.wm.removeKeybinding(k);
    });
}

function enableKeys(t) {
    disableKeys(t);
    const settings = getSettings(t);
    let flag = Meta.KeyBindingFlags.IGNORE_AUTOREPEAT;
    let mode = Shell.ActionMode.ALL;
    settings.settings_schema.list_keys().forEach( (k) => {
        L(0, "create setting for key %s", k);
        var k1 = k; // not sure if needed for the lambda
        Main.wm.addKeybinding(k, settings, flag, mode, () => { doCmd(k1); });
    });
    // https://stackoverflow.com/questions/12325405/gnome-shell-extension-key-binding
}

/*---- end of code similar to cinnamon version --*/

/* exported init */

/*
 * Created using instructions at https://gjs.guide/extensions/development/creating.html#extension-js
 *
 * monitor the output with journalctl -f -o cat /usr/bin/gnome-shell
 *
 * enable with ALT-F2 and command 'r' (restart)
 *
 * gnome-extensions enable lrtile-gnome@lrizzo.it
 *
 * More instructions https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension
 */

const _ = ExtensionUtils.gettext;	// helper for translations

export default class LrTile extends Extension {
    constructor(uuid) {
        super(uuid);
    }

    enable() {
        enableKeys(this);
    }

    disable() {
        log(`=== disable ${metadata.name}`);
        disableKeys(this);
    }
}

function init(meta) {
    log(`================== initializing ${Me.metadata.name}`);
    return new Extension(meta.uuid); /* do not pass meta, or do a deep copy if needed. */
}
