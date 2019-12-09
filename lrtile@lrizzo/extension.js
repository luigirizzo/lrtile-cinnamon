// Copyright 2019 Google LLC
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

let lrOptions = { uuid: "", rows: 6, cols: 6, border: 2, step: 2, logLevel: 0 };

// Log output in ~/.xsession-errors (used to be in ~/.cinnamon/glass.log )

// printf-like logging, no deep object print
function L(level, ...args) {
    if (level <= lrOptions.logLevel) {
        global.log(PF(...args));
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
    const Main = imports.ui.main;
    const monitor = Main.layoutManager.monitors[win.get_monitor()];
    L(2, "monitors %s monitor is %s",
      PO(Main.layoutManager.monitors), PO(monitor));
    return [monitor.x, monitor.y, monitor.width, monitor.height - 20];
}

// Handler for the various commands.
function doCmd(cmd) {
    let window = global.display.focus_window;
    if (!window) return L(0, "no window, nothing to do");
    let win = window.get_outer_rect();
    let [wX, wY, wW, wH] = [win.x, win.y, win.width, win.height];
    L(0, "CMD %s window %dx%d@%d,%d tile %s",
      cmd, wW, wH, wX, wY, window.tile_type);

    const [mX, mY, mW, mH] = getDisplayArea(window);
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

    window.tile(0, 0); // untile the window, otherwise move is not effective.
    const Meta = imports.gi.Meta;			// Flags values
    window.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
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

function disableKeys() {
    for (let i in LRKEY) {
	imports.ui.main.keybindingManager.removeHotKey(i);
    }
}

function enableKeys(t) {
    disableKeys();
    const Lang = imports.lang;
    for (let i in LRKEY) {
	let key = LRKEY[i], cmd = i; // need new variables for the lambda
	imports.ui.main.keybindingManager.addHotKey(cmd, key,
		// below, 'arg' is ?
		Lang.bind(t, function(arg) { doCmd(cmd); }));
    }
}

/* Cinnamon Extensions API */

function disable() { disableKeys(); }

function enable() {
    const uuid = lrOptions.uuid;
    L(0, "--- lrtile enable uuid %s ---", uuid);
    const optnames = ["cols", "rows", "border", "move", "size"];
    const Settings = imports.ui.settings;
    this.settings = new Settings.ExtensionSettings(lrOptions, uuid);
    for (let i in optnames) {
	L(0, " setting  %s %s this is %s", i, optnames[i], this);
	// parameter-value
	// TODO: handle updates on modifiers
	this.settings.bind(optnames[i], optnames[i]);
    }
    enableKeys(this);
    L(0, "preferences %s", PO(lrOptions));
}

function init(metadata) {  // 'this' is not set here ?
    L(0, "\n\nlrtile init Cinnamon version %s metadata %s",
      imports.misc.config.PACKAGE_VERSION,  PO(metadata, 2));
    lrOptions.uuid = metadata.uuid;
}

