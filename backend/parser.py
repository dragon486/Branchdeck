import hashlib
from tree_sitter import Parser
from tree_sitter_languages import get_language

# Helper to traverse all nodes in AST
def traverse_tree(node, callback):
    callback(node)
    for child in node.children:
        traverse_tree(child, callback)

# Helper to clean string quotes
def clean_quote(text: str) -> str:
    return text.strip("'\"` ")

# Parses TS/JS imports, calls, exports, declarations, and new expressions
def parse_ts_js(content_bytes: bytes) -> dict:
    parser = Parser()
    parser.set_language(get_language("typescript"))
    tree = parser.parse(content_bytes)
    
    imports = []
    calls = []
    declarations = []
    exports = []
    instantiations = []
    
    def visitor(node):
        # 1. Capture imports
        if node.type in ("import_statement", "import_alias_declaration"):
            for child in node.children:
                if child.type == "string":
                    imports.append(clean_quote(child.text.decode("utf8")))
        
        # 2. Capture function/method calls
        if node.type == "call_expression":
            expr = node.child_by_field_name("function")
            if expr:
                if expr.type == "identifier":
                    calls.append(expr.text.decode("utf8"))
                elif expr.type == "member_expression":
                    property_node = expr.child_by_field_name("property")
                    if property_node:
                        calls.append(property_node.text.decode("utf8"))
        
        # 3. Capture new expressions (e.g. new PrismaClient(), new OpenAI())
        if node.type == "new_expression":
            constructor_node = node.child_by_field_name("constructor")
            if constructor_node:
                instantiations.append(constructor_node.text.decode("utf8"))
        
        # 4. Capture function/method/class declarations
        if node.type in ("function_declaration", "method_definition", "class_declaration", "interface_declaration"):
            name_node = node.child_by_field_name("name")
            if name_node:
                declarations.append(name_node.text.decode("utf8"))

        # 5. Capture export statements
        if node.type == "export_statement":
            declaration = node.child_by_field_name("declaration")
            if declaration:
                name_node = declaration.child_by_field_name("name")
                if name_node:
                    exports.append(name_node.text.decode("utf8"))

    traverse_tree(tree.root_node, visitor)
    return {
        "imports": list(set(imports)),
        "calls": list(set(calls)),
        "declarations": list(set(declarations)),
        "exports": list(set(exports)),
        "instantiations": list(set(instantiations))
    }

# Parses Python imports, calls, decorators, and declarations
def parse_python(content_bytes: bytes) -> dict:
    parser = Parser()
    parser.set_language(get_language("python"))
    tree = parser.parse(content_bytes)
    
    imports = []
    calls = []
    declarations = []
    decorators = []
    
    def visitor(node):
        # 1. Capture import statements
        if node.type == "import_statement":
            for child in node.children:
                if child.type == "dotted_name":
                    imports.append(child.text.decode("utf8"))
        elif node.type == "import_from_statement":
            module_node = node.child_by_field_name("module_name")
            if module_node:
                imports.append(module_node.text.decode("utf8"))
        
        # 2. Capture function calls
        if node.type == "call":
            func = node.child_by_field_name("function")
            if func:
                if func.type == "identifier":
                    calls.append(func.text.decode("utf8"))
                elif func.type == "attribute":
                    attribute = func.child_by_field_name("attribute")
                    if attribute:
                        calls.append(attribute.text.decode("utf8"))

        # 3. Capture decorators (e.g. @app.post("/api/analyze"))
        if node.type == "decorator":
            decorators.append(node.text.decode("utf8").strip())

        # 4. Capture function/class declarations
        if node.type in ("function_definition", "class_definition"):
            name_node = node.child_by_field_name("name")
            if name_node:
                declarations.append(name_node.text.decode("utf8"))

    traverse_tree(tree.root_node, visitor)
    return {
        "imports": list(set(imports)),
        "calls": list(set(calls)),
        "declarations": list(set(declarations)),
        "decorators": list(set(decorators))
    }

# Parses Go imports, calls, and declarations
def parse_go(content_bytes: bytes) -> dict:
    parser = Parser()
    parser.set_language(get_language("go"))
    tree = parser.parse(content_bytes)
    
    imports = []
    calls = []
    declarations = []
    
    def visitor(node):
        # 1. Capture Go imports
        if node.type == "import_spec":
            path_node = node.child_by_field_name("path")
            if path_node:
                imports.append(clean_quote(path_node.text.decode("utf8")))
        
        # 2. Capture Go calls
        if node.type == "call_expression":
            func = node.child_by_field_name("function")
            if func:
                if func.type == "identifier":
                    calls.append(func.text.decode("utf8"))
                elif func.type == "selector_expression":
                    field = func.child_by_field_name("field")
                    if field:
                        calls.append(field.text.decode("utf8"))

        # 3. Capture Go declarations
        if node.type in ("function_declaration", "method_declaration"):
            name_node = node.child_by_field_name("name")
            if name_node:
                declarations.append(name_node.text.decode("utf8"))

    traverse_tree(tree.root_node, visitor)
    return {
        "imports": list(set(imports)),
        "calls": list(set(calls)),
        "declarations": list(set(declarations))
    }

# General file parsing dispatch with explainability metadata
def parse_file(file_path: str, content: str) -> dict:
    content_bytes = bytes(content, "utf8")
    content_hash = hashlib.sha256(content_bytes).hexdigest()
    
    ext = file_path.split(".")[-1].lower()
    
    if ext in ("ts", "tsx", "js", "jsx"):
        ast_info = parse_ts_js(content_bytes)
    elif ext == "py":
        ast_info = parse_python(content_bytes)
    elif ext == "go":
        ast_info = parse_go(content_bytes)
    else:
        ast_info = {"imports": [], "calls": [], "declarations": []}
        
    return {
        "hash": content_hash,
        "imports": ast_info["imports"],
        "calls": ast_info["calls"],
        "declarations": ast_info.get("declarations", []),
        "exports": ast_info.get("exports", []),
        "instantiations": ast_info.get("instantiations", []),
        "decorators": ast_info.get("decorators", []),
        "explainability": {
            "parser": "tree-sitter",
            "confidence": 0.98,
            "evidence": f"AST parsed {len(ast_info.get('declarations', []))} declarations and {len(ast_info.get('calls', []))} call expressions"
        }
    }
