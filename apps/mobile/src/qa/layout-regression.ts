import fs from "node:fs";
import path from "node:path";

export function runMobileLayoutRegression() {
  const failures: string[] = [];
  const assert = (ok: boolean, name: string) => {
    if (!ok) failures.push(name);
  };

  const root = path.resolve(process.cwd());
  const shell = fs.readFileSync(path.join(root, "src/ui/app-shell.tsx"), "utf8");
  const login = fs.readFileSync(path.join(root, "app/login.tsx"), "utf8");

  assert(
    shell.includes('from "react-native-safe-area-context"') &&
      shell.includes('edges={["top","bottom","left","right"]}'),
    "app shell uses native safe-area insets",
  );
  assert(
    shell.includes("minHeight:44") && shell.includes("hitSlop"),
    "app shell touch targets remain >=44px",
  );
  assert(
    shell.includes('keyboardShouldPersistTaps="handled"'),
    "app shell scroll handles keyboard taps",
  );
  assert(
    login.includes("KeyboardAvoidingView") &&
      login.includes('from "react-native-safe-area-context"'),
    "login is keyboard and safe-area aware",
  );

  return failures;
}

if (
  typeof process !== "undefined" &&
  process.env.DAUViet_MOBILE_LAYOUT_QA === "1"
) {
  const failures = runMobileLayoutRegression();
  if (failures.length) {
    throw new Error(
      "Mobile layout regression failed: " + failures.join(", "),
    );
  }
}
