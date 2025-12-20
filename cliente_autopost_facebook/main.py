from helpers.scraper import Scraper
import time

def read_item_from_csv(file_path):
    with open(file_path, 'r', encoding='latin-1') as f:
        lines = f.readlines()
    
    # Linha 1: titulo, preco, categoria, condicao
    dados = lines[0].strip().split(',')
    titulo = dados[0].strip()
    preco = dados[1].strip()
    categoria = dados[2].strip()
    condicao = dados[3].strip()
    
    # Linha 2: imagens separadas por virgula
    imagens = [img.strip() for img in lines[1].strip().split(',')]
    
    return {
        'titulo': titulo,
        'preco': preco,
        'categoria': categoria,
        'condicao': condicao,
        'imagens': imagens
    }

def publicar_item(scraper, item):
    # Vai para a pagina de criar item
    scraper.go_to_page('https://www.facebook.com/marketplace/create/item')
    time.sleep(10)  # Espera a pagina carregar completamente
    
    # Adiciona as imagens
    imagens_path = '\n'.join(item['imagens'])
    scraper.input_file_add_files('input[accept="image/*,image/heif,image/heic"]', imagens_path)
    time.sleep(3)
    
    # Pega todos os inputs da pagina
    from selenium.webdriver.common.by import By
    
    # Encontra todos os inputs de texto
    inputs = scraper.driver.find_elements(By.CSS_SELECTOR, 'input[type="text"]')
    
    # Preenche titulo (primeiro input)
    if len(inputs) > 0:
        inputs[0].click()
        inputs[0].send_keys(item['titulo'])
        print(f"Titulo preenchido: {item['titulo']}")
    time.sleep(1)
    
    # Preenche preco (segundo input)
    if len(inputs) > 1:
        inputs[1].click()
        inputs[1].send_keys(item['preco'])
        print(f"Preco preenchido: {item['preco']}")
    time.sleep(1)
    
    # Clica no campo de categoria (dropdown com texto "Categoria")
    try:
        categoria_label = scraper.driver.find_element(By.XPATH, '//span[text()="Categoria"]')
        categoria_dropdown = categoria_label.find_element(By.XPATH, './ancestor::div[contains(@class, "x")][@role="combobox" or @tabindex]')
        categoria_dropdown.click()
        time.sleep(2)
        # Seleciona a categoria na lista
        scraper.element_click_by_xpath('//span[text()="' + item['categoria'] + '"]')
        print(f"Categoria selecionada: {item['categoria']}")
    except Exception as e:
        print(f"Erro ao selecionar categoria: {e}")
        # Tenta metodo alternativo - clica diretamente no span Categoria
        try:
            scraper.driver.find_element(By.XPATH, '//span[text()="Categoria"]/..').click()
            time.sleep(2)
            scraper.element_click_by_xpath('//span[text()="' + item['categoria'] + '"]')
            print(f"Categoria selecionada (metodo 2): {item['categoria']}")
        except:
            pass
    time.sleep(1)
    
    # Clica no campo de condicao (dropdown com texto "Condição")
    try:
        condicao_label = scraper.driver.find_element(By.XPATH, '//span[text()="Condição"]')
        condicao_dropdown = condicao_label.find_element(By.XPATH, './ancestor::div[contains(@class, "x")][@role="combobox" or @tabindex]')
        condicao_dropdown.click()
        time.sleep(2)
        # Seleciona o segundo item da listbox (índice 1)
        opcoes = scraper.driver.find_elements(By.CSS_SELECTOR, '[role="option"]')
        if len(opcoes) > 1:
            opcoes[1].click()  # Segundo valor da lista
            print(f"Condicao selecionada: segundo item da lista")
    except Exception as e:
        print(f"Erro ao selecionar condicao: {e}")
        # Tenta metodo alternativo - clica diretamente no span Condição
        try:
            scraper.driver.find_element(By.XPATH, '//span[text()="Condição"]/..').click()
            time.sleep(2)
            opcoes = scraper.driver.find_elements(By.CSS_SELECTOR, '[role="option"]')
            if len(opcoes) > 1:
                opcoes[1].click()
                print(f"Condicao selecionada (metodo 2): segundo item da lista")
        except:
            pass
    
    print("Campos preenchidos!")
    
    # Clica no botao Avançar
    time.sleep(2)
    try:
        avancar_btn = scraper.driver.find_element(By.XPATH, '//span[text()="Avançar"]')
        avancar_btn.click()
        print("Botao Avancar clicado!")
    except Exception as e:
        print(f"Erro ao clicar em Avancar: {e}")
    
    time.sleep(3)
    
    # Seleciona até 20 checkboxes dos grupos (limite da pagina)
    try:
        checkboxes = scraper.driver.find_elements(By.CSS_SELECTOR, '[role="checkbox"]')
        count = 0
        for checkbox in checkboxes:
            if count >= 20:
                break
            try:
                # Verifica se o checkbox nao esta marcado
                if checkbox.get_attribute('aria-checked') == 'false':
                    checkbox.click()
                    count += 1
                    time.sleep(0.5)
            except:
                pass
        print(f"Checkboxes selecionados: {count}")
    except Exception as e:
        print(f"Erro ao selecionar checkboxes: {e}")
    
    time.sleep(2)
    
    # Clica no botao Publicar
    try:
        publicar_btn = scraper.driver.find_element(By.XPATH, '//span[text()="Publicar"]')
        publicar_btn.click()
        print("Botao Publicar clicado! Anuncio publicado!")
    except Exception as e:
        print(f"Erro ao clicar em Publicar: {e}")

# Inicia o scraper
scraper = Scraper('https://facebook.com')

# Login
scraper.add_login_functionality('https://facebook.com', 'svg[aria-label="Your profile"]', 'facebook')

# Le os dados do CSV
item = read_item_from_csv('csvs/items.csv')
print(f"Item carregado: {item['titulo']}")

# Publica o item
publicar_item(scraper, item)

input("Pressione Enter para fechar o navegador: ")
