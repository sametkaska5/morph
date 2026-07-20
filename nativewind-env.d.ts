/// <reference types="nativewind/types" />

// TypeScript 6, kod olmayan dosyaların side-effect import'unda (import "./global.css")
// bir modül bildirimi arıyor ve bulamayınca TS2882 veriyor. Metro bu importu
// NativeWind üzerinden işliyor, TS tarafında sadece boş bir modül bildirimi yeterli.
declare module "*.css";
