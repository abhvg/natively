
-----

# Natively - Expo (Router) + Re-pack (Rspack) Super App

This document provides a comprehensive technical overview of demonstrating a **Module Federation (Super App)** architecture within a React Native **Expo** environment.

This solution successfully replaces Expo's default **Metro** bundler with **Re-pack** and its **Rspack** bundler. This is a non-trivial task, as Expo and its file-based **Expo Router** are deeply integrated with Metro.

The architecture and solutions presented here are based on the work from and heavily inspired by the community-driven solutions found in the `ceopaludetto/expo-router-repack-template` repository and the accompanying `ceopaludetto.com/expo-router-repack` article.

-----

## 1\. Core Concept & Goal

The primary goal is to create a "Super App" architecture. This consists of:

1.  **`HostApp` (The Shell):** A primary, native-built application. It is responsible for building the main binary (APK/IPA) and provides all core shared dependencies (e.g., `react`, `react-native`, `expo`). It serves as the "shell" that dynamically loads features.
2.  **`ChildApp` (The Mini-App):** A complete, independently developed, and separately bundled application. It exposes its functionality to be consumed by the `HostApp`. It is bundled independently and served from a separate server (`http://localhost:9000`).

This model allows for independent development, deployment, and **Over-the-Air (OTA) updating** of features (`ChildApp`) without requiring a full rebuild or resubmission of the main native application (`HostApp`) to the app stores.

-----

## 2\. Key Technologies

  * **Expo (Router):** The React Native framework and its file-based navigation system.
  * **Re-pack (with Rspack):** A high-performance bundler for React Native, built on top of Rspack (a Rust-based Webpack-compatible bundler). It replaces Metro and, most importantly, **supports Module Federation**.
  * **Module Federation:** The technology that enables the Super App. It allows a JavaScript application to dynamically load code from another application at runtime, all while sharing common dependencies.

-----

## 3\. Key Features & Accomplishments

This repo successfully demonstrates:

  * **Rspack-Powered Expo:** A fully functional Expo application that uses Rspack (via Re-pack) for all bundling, completely replacing Metro.
  * **Expo Router Integration:** A successful integration with Expo Router, overcoming its hard dependencies on Metro.
  * **Dynamic Feature Loading:** The `HostApp` dynamically loads the `ChildApp` at runtime using `React.lazy` and `Suspense`.
  * **Shared Dependencies:** The `ChildApp` shares all its `package.json` dependencies with the `HostApp`. This is defined in the `rspack.config.mjs` and ensures that libraries like `react`, `expo`, and `react-native` are **not bundled twice**, making the `ChildApp` bundle extremely lightweight.
  * **Native Build Compatibility:** Custom Expo plugins are used to patch the native iOS (Xcode) and Android (Gradle) build scripts, forcing them to use Rspack instead of Metro for release builds.
  * **Cross-Platform:** The solution is configured to work for both Android and iOS.
  * **Dynamic Updates:** The `HostApp` fetches the `ChildApp` bundle from a remote URL. Updating the `ChildApp` on its server will provide the new code to users on the next app load without a new app store update.

-----

## 4\. Architecture & Project Structure

The project is structured as a monorepo with two distinct applications.

```
natively/
├── ChildApp/
│   ├── plugins/
│   │   └── expo-router-repack.js  # Custom plugin to patch native builds for Rspack
│   ├── src/
│   │   ├── screens/               # Expo Router file-based navigation
│   │   │   ├── _layout.tsx
│   │   │   ├── about.tsx
│   │   │   └── index.tsx
│   │   ├── application.tsx        # The entry point exposed via Module Federation
│   │   └── index.ts               # Main app registry (for standalone running)
│   ├── app.json                   # Expo config, registers the custom plugin
│   ├── package.json               # Note the "start" script with port 9000
│   └── rspack.config.mjs          # --- KEY FILE --- Defines `exposes` and `shared`
│
└── HostApp/
    ├── plugins/
    │   └── expo-router-repack.js  # Identical custom plugin for the host
    ├── src/
    │   ├── screens/
    │   │   ├── _layout.tsx
    │   │   ├── about.tsx
    │   │   └── index.tsx          # --- KEY FILE --- Imports ChildApp with React.lazy
    │   ├── application.tsx        # Standard Expo root component
    │   └── index.ts               # Main app registry
    ├── app.json                   # Expo config
    ├── package.json               # Defines all core dependencies
    └── rspack.config.mjs          # --- KEY FILE --- Defines `remotes` and `shared`
```

-----

## 5\. Detailed Configuration: How It Works

This setup requires overcoming several challenges related to Expo's deep integration with Metro. Here is the step-by-step breakdown.

### Part 1: Solving the Expo + Re-pack Challenge

To make Expo work with Rspack, we must intercept and "fix" three things: the native build scripts, the dev server, and the environment variables.

#### A. Patching Native Builds (`plugins/expo-router-repack.js`)

  * **Problem:** By default, Expo's `run-android`/`run-ios` commands are hard-wired to use Metro. The production build scripts in Xcode and Gradle also point to Metro's CLI.
  * **Solution:** A custom **Expo Plugin** is created (`plugins/expo-router-repack.js`) and registered in `app.json`. This plugin modifies the native build configurations *before* the build starts.
      * **iOS (`withXcodeProject`):** It finds the "Bundle React Native code and images" build phase in the Xcode project and replaces the script. It removes the hard-coded paths to Metro's CLI and ensures the standard Re-pack command is used.
      * **Android (`withAppBuildGradle`):** It modifies the `app/build.gradle` file, removing the `cliFile` (which points to Metro) and changing the `bundleCommand` to just `"bundle"`, which Re-pack's CLI understands.

#### B. Patching the Dev Server (`rspack.config.mjs`)

  * **Problem:** The Expo dev client (in your emulator/device) is hard-coded to look for Metro's virtual entry point at `/.expo/.virtual-metro-entry`. When using Rspack, this request fails.
  * **Solution:** The `rspack.config.mjs` file in both apps configures a **proxy** for the `devServer`. This proxy intercepts any requests to `/.expo/.virtual-metro-entry` and forwards them to `/index`, which is Rspack's default entry point.

<!-- end list -->

```javascript
// In rspack.config.mjs
export default ({ mode, platform, devServer }) => ({
  // ...
  devServer: !!devServer && {
    ...devServer,
    proxy: [
      {
        context: ["/.expo/.virtual-metro-entry"],
        pathRewrite: { "^/.expo/.virtual-metro-entry": "/index" },
      },
    ],
  },
  // ...
});
```

#### C. Injecting Environment Variables (`rspack.config.mjs`)

  * **Problem:** Expo Router relies on several `process.env` variables (like `EXPO_ROUTER_APP_ROOT`) that Metro normally injects at build time. Since Metro is gone, these are undefined, and Expo Router crashes.
  * **Solution:** We use Rspack's `DefinePlugin` to manually inject these variables. The `resolve(".")` and `resolve("./src/screens")` ensure the paths are correct for the running app.

<!-- end list -->

```javascript
// In rspack.config.mjs
import { DefinePlugin } from "@rspack/core";
import { resolve } from "node:path";
// ...
  plugins: [
    // ...
    new DefinePlugin({
      "process.env.EXPO_BASE_URL": JSON.stringify(""),
      "process.env.EXPO_OS": JSON.stringify(platform),
      "process.env.EXPO_PROJECT_ROOT": JSON.stringify(resolve(".")),
      "process.env.EXPO_ROUTER_ABS_APP_ROOT": JSON.stringify(resolve("./src/screens")),
      "process.env.EXPO_ROUTER_APP_ROOT": JSON.stringify("~/screens"),
      "process.env.EXPO_ROUTER_IMPORT_MODE": JSON.stringify("sync"),
    }),
    // ...
  ],
// ...
```

### Part 2: Configuring Module Federation

With the Expo + Rspack setup fixed, we configure Module Federation.

#### `ChildApp/rspack.config.mjs` (The Exposer)

This config "exposes" its `application.tsx` file under the alias `./ChildApp` so the host can import it. It also declares that *all* its dependencies are `shared`, meaning it expects the `HostApp` to provide them.

```javascript
// ...
    new Repack.plugins.ModuleFederationPluginV2({
      name: "ChildApp",
      filename: "ChildApp.container.js.bundle", // The bundle file to be served
      dts: false,
      exposes:{
        "./ChildApp": "./src/application.tsx", // Maps alias to the file
      },
      shared: Object.fromEntries(
        Object.entries(pkg.dependencies).map(([dep,{version}])=>{
          return [
            dep,
            {singleton:true, eager:true, requiredVersion:version} // Shares all dependencies
          ]
        })
      )
    })
// ...
```

#### `HostApp/rspack.config.mjs` (The Consumer)

This config defines its "remotes," telling it where to find the `ChildApp`'s bundle. It also shares all *its* dependencies, making them available to any remote that needs them.

```javascript
// ...
    new Repack.plugins.ModuleFederationPluginV2({
      name: "HostApp",
      filename: "HostApp.container.js.bundle",
      dts: false,
      remotes:{
        // Maps the "ChildApp" name to its live URL
        ChildApp: `ChildApp@http://localhost:9000/android/ChildApp.container.js.bundle`
      },
      shared: Object.fromEntries(
        Object.entries(pkg.dependencies).map(([dep,{version}])=>{
          return [
            dep,
            {singleton:true, eager:true, requiredVersion:version} // Provides all dependencies
          ]
        })
      )
    })
// ...
```

### Part 3: Code Implementation (Loading & Isolation)

This is how the applications are wired together in code.

#### `HostApp/src/screens/index.tsx` (Consuming the Remote)

The `HostApp`'s main screen uses `React.lazy` to dynamically import and render the `Application` component from the `ChildApp` remote.

  * `React.lazy` is used to import `"ChildApp/ChildApp"`. This string maps directly to the `remotes` (`ChildApp`) and `exposes` (`./ChildApp`) configuration in the Rspack configs.
  * `<Suspense>` wraps the component to provide a "Loading..." fallback while the remote bundle is fetched.
  * **Crucially**, it is wrapped in `<NavigationIndependentTree>` to isolate the Host's navigation state from the Child's.

<!-- end list -->

```tsx
// HostApp/src/screens/index.tsx
import React, {Suspense} from "react";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationIndependentTree } from "@react-navigation/native"; 

// Lazy load the exposed component from the remote
const ChildApp = React.lazy(() => 
  import("ChildApp/ChildApp").then((module) => ({ default: module.Application }))
);

export default function IndexScreen() {
  return (
    <SafeAreaView>
      <Text>Host</Text>
      <Suspense fallback={<Text>Loading Child App...</Text>}>
        <NavigationIndependentTree>
          <ChildApp />
        </NavigationIndependentTree>
      </Suspense>
    </SafeAreaView>
  );
}
```

#### `ChildApp/src/application.tsx` (Exposing the App & Isolating)

The `ChildApp` cannot just export its root `Application.tsx`. Instead, it exposes a specific component that bootstraps its own navigation.

  * It exports a function named `Application`.
  * This function wraps Expo Router's `ExpoRoot` inside a `<NavigationIndependentTree>`. This is **critical** and mirrors the Host's setup, ensuring the two navigation systems do not conflict.
  * A `useState/useEffect` mount-guard is used. This prevents the `ExpoRoot` from rendering until the component is *fully mounted* within the host, avoiding stateful logic from running prematurely and causing errors.

<!-- end list -->

```tsx
// ChildApp/src/application.tsx
import React, { useState, useEffect } from "react";
import { ExpoRoot} from "expo-router";
import { ctx } from "expo-router/_ctx";
import { NavigationIndependentTree } from "@react-navigation/native";

export function Application() {
  const [isMounted, setIsMounted] = useState(false);

  // Set isMounted to true on the first successful render
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    // Return a minimal, inert component until the mount cycle is complete.
    // This prevents the ExpoRoot from running its stateful logic prematurely.
    return null;
  }

  // Once mounted, render the full navigation container.
  return (
    <NavigationIndependentTree>
      <ExpoRoot context={ctx} />
    </NavigationIndependentTree>
  );
}
```

-----

## 6\. How to Run the Project (Using Bun) 🚀

### Prerequisites

First, ensure you have **Bun** installed on your system. You can find installation instructions at [bun.sh](https://bun.sh/).

This project requires running two separate bundlers simultaneously, so you will need **at least two terminal windows**.

-----

### **Terminal 1: Start the `ChildApp` Server** 📦

This terminal will serve the `ChildApp` bundle, making it available as a remote mini-app.

```bash
# 1. Navigate to the ChildApp directory
cd ChildApp

# 2. Install dependencies using Bun
bun install

# 3. Start the Rspack server on port 9000
bun run start
```

**Keep this terminal running.** It is now serving the mini-app at `http://localhost:9000`.

-----

### **Terminal 2: Build and Run the `HostApp`** 🏠📱

This terminal will install, bundle, and launch the main `HostApp` on your emulator or physical device.

```bash
# 1. Navigate to the HostApp directory in a NEW terminal window
cd HostApp

# 2. Install dependencies using Bun and make android/iOS specific setups
bun install
bun expo prebuild --clean
# 3. Build and run on Android
bun run android

# --- OR ---

# 3. Build and run on iOS
cd ios; bunx pods-install # Install CocoaPods dependencies

bun run ios
```

The `run android` or `run ios` command will automatically start the `HostApp`'s bundler and then build and install the native app. The app will connect to its own bundler, which will then dynamically fetch the `ChildApp` bundle from the server running in Terminal 1.

-----

## 7\. Known Issues & Limitations

This repo is still in development and has several known limitations based on the current state of Expo, Re-pack, and Rspack:

  * **Expo 54+ Support:** This implementation is not compatible with Expo 54. This is due to compilation limitations in Rspack's React Native plugin when handling the latest `View` component changes in recent React Native versions.
  * **Root Component Loading:** Loading a full Expo root component (e.g., from `App.js`) as a remote bundle is unstable and produces errors. The current, stable workaround is to expose and load specific components or navigation trees (like `application.tsx`) rather than the entire app.
  * **Navigation Isolation:** Navigation state is *not* automatically sandboxed. This was a feature of older Callstack solutions but must be handled manually here by wrapping **both** the exposed component (`ChildApp`) and the consumption site (`HostApp`) in `<NavigationIndependentTree>`. Failure to do so will result in navigation state conflicts.