#include <tree_sitter/api.h>
#include <iostream>

extern "C" const TSLanguage *tree_sitter_c(void);
extern "C" const TSLanguage *tree_sitter_javascript(void);

int main() {
    std::cout << "TREE_SITTER_LANGUAGE_VERSION: " << TREE_SITTER_LANGUAGE_VERSION << std::endl;
    TSParser *parser = ts_parser_new();
    const TSLanguage *lang_c = tree_sitter_c();
    std::cout << "C language ptr: " << lang_c << std::endl;
    if (lang_c) {
        std::cout << "C language version: " << ts_language_version(lang_c) << std::endl;
    }
    bool ok_c = ts_parser_set_language(parser, lang_c);
    std::cout << "ts_parser_set_language(c): " << (ok_c ? "SUCCESS" : "FAILED") << std::endl;

    const TSLanguage *lang_js = tree_sitter_javascript();
    std::cout << "JS language ptr: " << lang_js << std::endl;
    if (lang_js) {
        std::cout << "JS language version: " << ts_language_version(lang_js) << std::endl;
    }
    bool ok_js = ts_parser_set_language(parser, lang_js);
    std::cout << "ts_parser_set_language(js): " << (ok_js ? "SUCCESS" : "FAILED") << std::endl;

    ts_parser_delete(parser);
    return 0;
}
