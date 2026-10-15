import { app, HttpRequest } from "@azure/functions";
import { guardHttpHandler } from "./request-policy";

app.hook.preInvocation((hook) => {
  if (hook.invocationContext.options.trigger.type !== "httpTrigger") return;
  const handler = hook.functionHandler;
  hook.functionHandler = async (...args: unknown[]) => {
    const request = args[0];
    if (!(request instanceof HttpRequest)) throw new Error("HTTP request input is missing.");
    return guardHttpHandler((input, context) => handler(input, context))(request, hook.invocationContext);
  };
});
