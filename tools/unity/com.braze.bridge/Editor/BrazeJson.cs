using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Braze.Bridge.Editor
{
    // A deliberately small JSON serializer keeps the bridge dependency-free.
    // Its accepted values are null, bool, string, numeric primitives,
    // IDictionary<string, object>, and IEnumerable.
    internal static class BrazeJson
    {
        public static string Serialize(object value, bool pretty = false)
        {
            var output = new StringBuilder(4096);
            WriteValue(output, value, pretty, 0);
            return output.ToString();
        }

        private static void WriteValue(StringBuilder output, object value, bool pretty, int depth)
        {
            if (value == null)
            {
                output.Append("null");
                return;
            }

            if (value is string text)
            {
                WriteString(output, text);
                return;
            }

            if (value is bool boolean)
            {
                output.Append(boolean ? "true" : "false");
                return;
            }

            if (value is IDictionary<string, object> objectDictionary)
            {
                WriteObject(output, objectDictionary, pretty, depth);
                return;
            }

            if (value is IDictionary dictionary)
            {
                var normalized = new Dictionary<string, object>();
                foreach (DictionaryEntry entry in dictionary)
                {
                    normalized[Convert.ToString(entry.Key, CultureInfo.InvariantCulture)] = entry.Value;
                }
                WriteObject(output, normalized, pretty, depth);
                return;
            }

            if (value is IEnumerable enumerable && !(value is byte[]))
            {
                WriteArray(output, enumerable, pretty, depth);
                return;
            }

            if (IsNumber(value))
            {
                WriteNumber(output, value);
                return;
            }

            throw new InvalidOperationException(
                $"BrazeJson cannot serialize values of type {value.GetType().FullName}.");
        }

        private static void WriteObject(
            StringBuilder output,
            IDictionary<string, object> value,
            bool pretty,
            int depth)
        {
            output.Append('{');
            var first = true;
            foreach (var pair in value)
            {
                if (!first)
                {
                    output.Append(',');
                }
                NewLine(output, pretty, depth + 1);
                WriteString(output, pair.Key);
                output.Append(pretty ? ": " : ":");
                WriteValue(output, pair.Value, pretty, depth + 1);
                first = false;
            }

            if (!first)
            {
                NewLine(output, pretty, depth);
            }
            output.Append('}');
        }

        private static void WriteArray(
            StringBuilder output,
            IEnumerable value,
            bool pretty,
            int depth)
        {
            output.Append('[');
            var first = true;
            foreach (var item in value)
            {
                if (!first)
                {
                    output.Append(',');
                }
                NewLine(output, pretty, depth + 1);
                WriteValue(output, item, pretty, depth + 1);
                first = false;
            }

            if (!first)
            {
                NewLine(output, pretty, depth);
            }
            output.Append(']');
        }

        private static void WriteString(StringBuilder output, string value)
        {
            output.Append('"');
            foreach (var character in value ?? "")
            {
                switch (character)
                {
                    case '"': output.Append("\\\""); break;
                    case '\\': output.Append("\\\\"); break;
                    case '\b': output.Append("\\b"); break;
                    case '\f': output.Append("\\f"); break;
                    case '\n': output.Append("\\n"); break;
                    case '\r': output.Append("\\r"); break;
                    case '\t': output.Append("\\t"); break;
                    default:
                        if (character < 0x20)
                        {
                            output.Append("\\u");
                            output.Append(((int)character).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            output.Append(character);
                        }
                        break;
                }
            }
            output.Append('"');
        }

        private static void WriteNumber(StringBuilder output, object value)
        {
            switch (value)
            {
                case float single:
                    if (float.IsNaN(single) || float.IsInfinity(single))
                    {
                        throw new InvalidOperationException("JSON cannot encode NaN or Infinity.");
                    }
                    output.Append(single.ToString("R", CultureInfo.InvariantCulture));
                    break;
                case double real:
                    if (double.IsNaN(real) || double.IsInfinity(real))
                    {
                        throw new InvalidOperationException("JSON cannot encode NaN or Infinity.");
                    }
                    output.Append(real.ToString("R", CultureInfo.InvariantCulture));
                    break;
                case decimal precise:
                    output.Append(precise.ToString(CultureInfo.InvariantCulture));
                    break;
                default:
                    output.Append(Convert.ToString(value, CultureInfo.InvariantCulture));
                    break;
            }
        }

        private static bool IsNumber(object value)
        {
            return value is byte || value is sbyte || value is short || value is ushort ||
                   value is int || value is uint || value is long || value is ulong ||
                   value is float || value is double || value is decimal;
        }

        private static void NewLine(StringBuilder output, bool pretty, int depth)
        {
            if (!pretty)
            {
                return;
            }

            output.Append('\n');
            output.Append(' ', depth * 2);
        }
    }
}
