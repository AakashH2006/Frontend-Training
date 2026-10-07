/* A second context, deliberately much smaller.

   The reading-list context is state + a reducer. This one is a value and a
   toggle, and it is here because it is the case context is genuinely for:
   something the whole tree might want, that no component in the middle has any
   reason to forward.

   Nothing between App and a button needs to know about the theme, and with
   props every one of them would have to. */

import { createContext, useContext, useState, type ReactNode } from "react";

export type Density = "comfortable" | "compact";

interface ThemeValue {
    readonly density: Density;
    readonly toggleDensity: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
    const [density, setDensity] = useState<Density>("comfortable");

    /* An object literal as the value, which *is* a new object every render -
       the case the useMemo advice is actually about.

       Not memoised here, and the reason is worth stating rather than
       hand-waving: this provider re-renders only when `density` changes, since
       it holds nothing else. So "a new object on every render" and "a new
       object when the value changed" are the same thing here. useMemo would
       add a dependency array to keep correct and save nothing.

       It would matter if this provider also held unrelated state. */
    const value: ThemeValue = {
        density,
        toggleDensity: () =>
            setDensity((previous) => (previous === "comfortable" ? "compact" : "comfortable"))
    };

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
    const value = useContext(ThemeContext);

    if (value === null) {
        throw new Error("useTheme must be used inside a <ThemeProvider>.");
    }

    return value;
}
