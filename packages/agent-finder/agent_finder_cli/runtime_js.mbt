extern "js" fn host_os() -> String =
  #| function() {
  #|   if (typeof process === "undefined") return "unknown";
  #|   if (process.platform === "darwin") return "darwin";
  #|   if (process.platform === "linux") return "linux";
  #|   if (process.platform === "win32") return "windows";
  #|   return process.platform || "unknown";
  #| }

extern "js" fn host_arch() -> String =
  #| function() {
  #|   if (typeof process === "undefined") return "unknown";
  #|   return process.arch || "unknown";
  #| }

extern "js" fn host_home() -> String =
  #| function() {
  #|   if (typeof process !== "undefined" && process.env && process.env.HOME) {
  #|     return process.env.HOME;
  #|   }
  #|   try {
  #|     return require("node:os").homedir();
  #|   } catch (_) {
  #|     return "";
  #|   }
  #| }

extern "js" fn generated_at() -> String =
  #| function() {
  #|   const d = new Date();
  #|   const pad = (n) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  #|   const y = d.getFullYear();
  #|   const m = pad(d.getMonth() + 1);
  #|   const day = pad(d.getDate());
  #|   const hh = pad(d.getHours());
  #|   const mm = pad(d.getMinutes());
  #|   const ss = pad(d.getSeconds());
  #|   const offsetMinutes = -d.getTimezoneOffset();
  #|   const sign = offsetMinutes >= 0 ? "+" : "-";
  #|   const oh = pad(offsetMinutes / 60);
  #|   const om = pad(offsetMinutes % 60);
  #|   return `${y}-${m}-${day}T${hh}:${mm}:${ss}${sign}${oh}:${om}`;
  #| }

extern "js" fn which_command(command : String) -> String =
  #| function(command) {
  #|   try {
  #|     const cp = require("node:child_process");
  #|     const path = cp.execFileSync("/usr/bin/which", [command], {
  #|       encoding: "utf8",
  #|       stdio: ["ignore", "pipe", "ignore"],
  #|       timeout: 1000,
  #|     }).trim().split(/\r?\n/)[0];
  #|     return path || "";
  #|   } catch (_) {
  #|     return "";
  #|   }
  #| }

extern "js" fn path_exists(path : String) -> Bool =
  #| function(path) {
  #|   try {
  #|     return require("node:fs").existsSync(path);
  #|   } catch (_) {
  #|     return false;
  #|   }
  #| }

extern "js" fn path_executable(path : String) -> Bool =
  #| function(path) {
  #|   try {
  #|     const fs = require("node:fs");
  #|     fs.accessSync(path, fs.constants.X_OK);
  #|     return true;
  #|   } catch (_) {
  #|     return false;
  #|   }
  #| }

extern "js" fn read_version(path : String, version_arg : String) -> String =
  #| function(path, versionArg) {
  #|   if (!path || !versionArg) return "";
  #|   try {
  #|     const cp = require("node:child_process");
  #|     const args = versionArg.split(" ").filter(Boolean);
  #|     const output = cp.execFileSync(path, args, {
  #|       encoding: "utf8",
  #|       stdio: ["ignore", "pipe", "ignore"],
  #|       timeout: 1500,
  #|     }).trim();
  #|     return output ? output.split(/\r?\n/)[0] : "";
  #|   } catch (_) {
  #|     return "";
  #|   }
  #| }
