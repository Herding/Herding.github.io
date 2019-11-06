---
layout: post
title: Gaussian Processes
---

最近，阿喵又和隔壁家的阿汪闹的不欢。只是因为阿汪觉得$(1,\ 1),(2,\ 3.9)$可以用一条直线表示，而阿喵不服，咬定要用二次曲线表示。

阿喵啊，如果给线性函数和二次函数分配概率，在这样的观测下，显然阿汪的直线更好哦。（啊！！！这猫爪子可真带劲！）

---

一个数据集下，当然可能存在多个函数拟合这些数据。多个函数都可以拟合数据，难不成一个模型用多个函数表示？

哎，再加上概率分布就可以咯。Gaussian Processes (高斯过程)就干了这么一件事。

网上一搜，这GPs还真的不少呢。通俗易懂白话版[^1]，大牛整理总结版[^2]，美文赏析英文版[^3]，高校课件版[^4]，著作权威版[^5]，以及无敌汇总版[^6]……

我好像也就只能贴段程序，跑跑效果了。

### 训练过程

<iframe width="900" height="800" frameborder="0" scrolling="no" src="//plot.ly/~HerdingCat/12.embed"> </iframe>

什么？阿喵你不想看文字，那看图（加载时间可能较长）吧，转过来😊，更好看的可视化效果请看角标[^8]

以上，针对目标函数$\sin(\cdot)$进行训练，四张子图从上到下分别是'未训练'，'一轮训练之后'，'二轮训练之后'，'三轮训练之后'。

其中深绿色的表示各个函数可能性的均值，浅绿色区域表示`[mean + std, mean - std]`，紫色线条表示可能的函数，淡紫色的点表示训练点。

随着训练次数的增多，观测数据的增多，各条紫色线条都越来越像$\sin(\cdot)$；同时在最后一张图上可以看到，观测点越多的地方，预测趋向一致，观测点少的地方，依然容忍了可能函数间的差异。

喵？什么叫各个函数可能性的均值，更多细节查看角标[^7]？

对于一个观测$x = 1$而言，对应的函数有好多好多，这所有的函数都服从高斯分布，那么它们各自函数值$y$也服从高斯分布。

高斯分布有**性质**：两个高斯叠加后的分布仍服从高斯分布。

所以如果在$x = 1$上做一条$y$轴，那么轴上的点也服从高斯分布（此处，可以在纸上画出常规的高斯分布，然后旋转90度，这样理解）

喵，我知道了！那么各个函数的均值实际上就是将$x$确定后，求$y$的均值。

999，没错。

**将函数服从高斯分布转化为其函数值服从高斯分布**，是不是很巧妙呢！

相对均值，我们更关系各个函数之间的相关性，因此均值的先验为零。能有最后一张图，就是因为函数之间的相关性，观测的$y$相近，其周围的$y$也可能相近，未观测的$y$附近可能存在较大差别。

👇是代码部分啦。

### 复制粘贴后即可运行的代码

没有过多注释，建议配合代码后讲解。

其中训练集是通过`xTrain = np.random.uniform(0, 5, 3)`以及`yTrain = np.sin(xTrain)`生成的。

```python
import numpy as np
import matplotlib.pyplot as plt


def mean(x):
    return np.zeros_like(x).reshape(len(x))


def kernel(xi, xj):
    sqdist = np.sum(xi**2, 1).reshape(-1, 1) + np.sum(xj**2, 1) - 2 * np.dot(xi, xj.T)
    return np.exp(-.5 * sqdist)


def GPs_prior(x, mean, kernel):
    return mean(x), kernel(x, x)


def GPs_post(xTest, xTrain, yTrain, kernel):
    if not hasattr(GPs_post, 'xTra') or not hasattr(GPs_post, 'yTra'):
        GPs_post.xTra = xTrain
        GPs_post.yTra = yTrain
    else :
        GPs_post.xTra = np.concatenate((GPs_post.xTra, xTrain), axis=0)
        GPs_post.yTra = np.concatenate((GPs_post.yTra, yTrain), axis=0)

    k = kernel(GPs_post.xTra, GPs_post.xTra)
    ks = kernel(GPs_post.xTra, xTest)
    l = np.linalg.cholesky(k + 0.00005 * np.eye(len(GPs_post.xTra)))

    alpha = np.linalg.solve(l.T, np.linalg.solve(l, GPs_post.yTra))
    v = np.linalg.solve(l, ks)

    mu = np.dot(ks.T, alpha).reshape(len(xTest))
    sigma = kernel(xTest, xTest) - np.dot(v.T, v)

    return mu, sigma


# prior
xTest = np.linspace(0, 5, 100).reshape(-1, 1)
yMean, yCov = GPs_prior(xTest, mean, kernel)
yStd = yCov.diagonal()

plt.figure(figsize=(8, 8))
plt.subplot(2, 1, 1)
plt.plot(xTest, yMean, 'k', lw=3, zorder=9)
plt.fill_between(xTest.flat, yMean - yStd, yMean + yStd, alpha=0.2, color='k')
yTest = np.random.multivariate_normal(yMean, yCov, 6)

plt.plot(xTest, yTest.T, lw=1)
plt.xlim(0, 5)
plt.ylim(-3, 3)

# training
for _ in range(3):
    # observation
    xTrain = np.random.uniform(0, 5, 3)
    yTrain = np.sin(xTrain)

    # get posterior
    yMean, yCov = GPs_post(xTest, xTrain.reshape(-1, 1), yTrain, kernel)
    yStd = np.sqrt(yCov.diagonal())

plt.subplot(2, 1, 2)
plt.plot(xTest, yMean, 'k', lw=3, zorder=9)
plt.fill_between(xTest.flat, yMean - yStd, yMean + yStd, alpha=0.2, color='k')

yTest = np.random.multivariate_normal(yMean, yCov, 6)
plt.plot(xTest, yTest.T, lw=1)
plt.scatter(GPs_post.xTra, GPs_post.yTra, c='r', s=50, zorder=10, edgecolors=(0, 0, 0))
plt.xlim(0, 5)
plt.ylim(-3, 3)
plt.tight_layout()

plt.show()
```

该程序中，目标函数预设为`sin()`，其中关键函数为`GPs_prior(x, mean, kernel)`和`GPs_post(xTest, xTrain, yTrain, kernel)`分别用于初始化先验概率和求解后验概率。

初始化先验概率时，默认各函数的**均值为零**，各函数间的相关性通过kernel求解，也就是构造了$y \sim \mathcal N(\vec 0, \Sigma)$。

求解后验概率时，需要输入观测数据对$(x_{train}, y_{train})$，以及待预测的输入$x_{test}$和用于计算相关性的kernel，最后通过高斯分布求得$y_{test}$。

阿喵表示，这写的啥代码啊！

程序中比较费解的大概是`for`循环部分和`GPs_post(xTest, xTrain, yTrain, kernel)`部分，其中`for`循环用于控制训练次数，此处训练3次，并随机输入3次训练数据对；`GPs_post(xTest, xTrain, yTrain, kernel)`则是求解$P(y_{test}|x_{test}, x_{train}, y_{train}) \sim \mathcal N(\vec \mu_*, \Sigma_*)$这样一个条件概率。具体求解过程可参考Gaussian Process - Machine Learning的附录A.2及A.3，可作为结论记住：


$$
\begin{aligned}
\vec \mu & = \vec \mu(x_{test}) + \mathbf K^T_*\mathbf K^{-1}y_{train} \\
\Sigma & = \mathbf K_{**} - \mathbf K^T_*\mathbf K^{-1}\mathbf K_*\\
\\

\mathbf K  & = kernel(x_{train}, x_{train})\\
\mathbf K_* & = kernel(x_{train}, x_{test}) \\
\mathbf K_{**} & = kernel(x_{test}, x_{test}) \\
\vec \mu(x_{test}) &= \vec 0 \\
\end{aligned}
$$


喵？又在骗我？明显代码不是这么写的！

一个有趣的点来了：**某些时候工程上并不能很好的重现理论效果。**

由于计算机对于求逆的数值精度并不是很好，所以此处用cholesky分解代替同时考虑噪声，得到$\mathbf K + \epsilon = \mathbf {LL^T}$。

> 该部分单纯替换公式，看累了可以跳过，喵。
>
> 线性方程组$\mathbf {AX} = \mathbf B$求解用$\mathbf X = \mathbf{A \setminus B} = \mathbf A^{-1}\mathbf B$表示，对应`numpy`中`numpy.linalg.solve(A, B)`。
>
> 已知$(\mathbf K + \epsilon)^{-1} = \mathbf {L^{-T}L^{-1}}$，
>
> 令$\alpha = (\mathbf K + \epsilon) ^{-1}y_{train} = \mathbf L^T \setminus \mathbf L \setminus y_{train}$,
>
> 令$v = \mathbf L^{-1}\mathbf K_*$，
>
> 则
>
> 
> $$
> v^Tv = (\mathbf L^{-1} \mathbf K_{*})^T(\mathbf L^{-1} \mathbf K_{*}) \\
>  = \mathbf K^T_{*} \mathbf L^{-T} \mathbf L^{-1} \mathbf K_{*} \\
>  = \mathbf K^T_{*} (\mathbf L \mathbf L^T)^{-1} \mathbf K_{*} \\
>  = \mathbf K^T_{*} (\mathbf K + \epsilon)^{-1} \mathbf K_{*}
> $$
> 
>
> 
>
> 因此，
>
> 
> $$
> \vec \mu = \mathbf K^T \alpha \\
> \Sigma = \mathbf K_{**} - v^Tv
> $$
> 

## 参考

[^1]: [张馨宇答如何通熟易懂地介绍Gaussian Process](https://www.zhihu.com/question/46631426/answer/102211375)
[^2]: [高斯过程（Gaussian Process）理解](http://www.idataskys.com/2019/05/01/高斯过(Gaussian%20Process)程理解/)
[^3]: [Gaussian Processes for Dummies](http://katbailey.github.io/post/gaussian-processes-for-dummies/)
[^4]: [Gaussian Process - Machine Learning](http://cs229.stanford.edu/section/cs229-gaussian_processes.pdf)
[^5]: Machine Learning, a Probabilistic Perspective, Chapter 15
[^6]: [The Gaussian Processes Web Site](http://www.gaussianprocess.org)
[^7]: [Gaussian Process, not quite for dummies](https://yugeten.github.io/posts/2019/09/GP/)
[^8]: [A Visual Exploration of Gaussian Processes](https://www.jgoertler.com/visual-exploration-gaussian-processes/)

