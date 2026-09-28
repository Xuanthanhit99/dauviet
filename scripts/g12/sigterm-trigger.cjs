// G12 graceful-shutdown probe preload (node -r). Windows cannot deliver a real SIGTERM to another
// process, so this emits the signal INSIDE the API process - exercising exactly the handler that
// app.enableShutdownHooks() installs - as soon as the probe creates the trigger file.
const fs = require('fs');
const trigger = process.env.G12_SIGTERM_TRIGGER_FILE;
const t0 = Date.now();
if (trigger) {
  const timer = setInterval(() => {
    if (fs.existsSync(trigger)) {
      clearInterval(timer);
      process.stdout.write(`G12_SIGTERM_EMITTED at=${Date.now() - t0}ms listeners=${process.listenerCount('SIGTERM')}\n`);
      process.emit('SIGTERM', 'SIGTERM');
    }
  }, 100);
  timer.unref();
}
process.on('exit', (code) => process.stdout.write(`G12_PROCESS_EXIT code=${code} at=${Date.now() - t0}ms\n`));
