// @ts-expect-error missing types
import * as TraceEngine from '@paulirish/trace_engine';
// import * as TraceEngine from './tmp-trace-engine/trace-engine.js';
// does polyfillDOMRect
import '@paulirish/trace_engine/analyze-trace.mjs';

const TraceProcessor = TraceEngine.Processor.TraceProcessor;
const TraceHandlers = TraceEngine.Handlers.ModelHandlers;
const RootCauses = TraceEngine.RootCauses.RootCauses.RootCauses;

export {
  TraceProcessor,
  TraceHandlers,
  RootCauses,
};
